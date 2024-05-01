import { NostrEvent, NostrFilter, NSchema as n } from '@nostrify/nostrify';
import { relayInfoController } from '@/controllers/nostr/relay-info.ts';
import * as pipeline from '@/pipeline.ts';
import {
  type ClientCLOSE,
  type ClientCOUNT,
  type ClientEVENT,
  type ClientMsg,
  clientMsgSchema,
  type ClientREQ,
} from '@/schemas/nostr.ts';
import { Storages } from '@/storages.ts';

import type { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';

/** Limit of initial events returned for a subscription. */
const FILTER_LIMIT = 100;

/** NIP-01 relay to client message. */
type RelayMsg =
  | ['EVENT', string, NostrEvent]
  | ['NOTICE', string]
  | ['EOSE', string]
  | ['OK', string, boolean, string]
  | ['COUNT', string, { count: number; approximate?: boolean }];

/** Set up the Websocket connection. */
function connectStream(socket: WebSocket) {
  const controllers = new Map<string, AbortController>();

  socket.onmessage = (e) => {
    const result = n.json().pipe(clientMsgSchema).safeParse(e.data);
    if (result.success) {
      handleMsg(result.data);
    } else {
      send(['NOTICE', 'Invalid message.']);
    }
  };

  socket.onclose = () => {
    for (const controller of controllers.values()) {
      controller.abort();
    }
  };

  /** Handle client message. */
  function handleMsg(msg: ClientMsg) {
    switch (msg[0]) {
      case 'REQ':
        handleReq(msg);
        return;
      case 'EVENT':
        handleEvent(msg);
        return;
      case 'CLOSE':
        handleClose(msg);
        return;
      case 'COUNT':
        handleCount(msg);
        return;
    }
  }

  /** Handle REQ. Start a subscription. */
  async function handleReq([_, subId, ...rest]: ClientREQ): Promise<void> {
    const filters = prepareFilters(rest);

    const controller = new AbortController();
    controllers.get(subId)?.abort();
    controllers.set(subId, controller);

    for (const event of await Storages.db.query(filters, { limit: FILTER_LIMIT })) {
      send(['EVENT', subId, event]);
    }

    send(['EOSE', subId]);

    try {
      for await (const msg of Storages.pubsub.req(filters, { signal: controller.signal })) {
        if (msg[0] === 'EVENT') {
          send(['EVENT', subId, msg[2]]);
        }
      }
    } catch (_e) {
      controllers.delete(subId);
    }
  }

  /** Handle EVENT. Store the event. */
  async function handleEvent([_, event]: ClientEVENT): Promise<void> {
    try {
      // This will store it (if eligible) and run other side-effects.
      await pipeline.handleEvent(event, AbortSignal.timeout(1000));
      send(['OK', event.id, true, '']);
    } catch (e) {
      if (e instanceof pipeline.RelayError) {
        send(['OK', event.id, false, e.message]);
      } else {
        send(['OK', event.id, false, 'error: something went wrong']);
        console.error(e);
      }
    }
  }

  /** Handle CLOSE. Close the subscription. */
  function handleClose([_, subId]: ClientCLOSE): void {
    const controller = controllers.get(subId);
    if (controller) {
      controller.abort();
      controllers.delete(subId);
    }
  }

  /** Handle COUNT. Return the number of events matching the filters. */
  async function handleCount([_, subId, ...rest]: ClientCOUNT): Promise<void> {
    const { count } = await Storages.db.count(prepareFilters(rest));
    send(['COUNT', subId, { count, approximate: false }]);
  }

  /** Send a message back to the client. */
  function send(msg: RelayMsg): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }
}

/** Enforce the filters with certain criteria. */
function prepareFilters(filters: ClientREQ[2][]): NostrFilter[] {
  return filters.map((filter) => {
    const narrow = Boolean(filter.ids?.length || filter.authors?.length);
    const search = narrow ? filter.search : `domain:${Conf.url.host} ${filter.search ?? ''}`;
    // Return only local events unless the query is already narrow.
    return { ...filter, search };
  });
}

const relayController: AppController = (c, next) => {
  const upgrade = c.req.header('upgrade');

  // NIP-11: https://github.com/nostr-protocol/nips/blob/master/11.md
  if (c.req.header('accept') === 'application/nostr+json') {
    return relayInfoController(c, next);
  }

  if (upgrade?.toLowerCase() !== 'websocket') {
    return c.text('Please use a Nostr client to connect.', 400);
  }

  const { socket, response } = Deno.upgradeWebSocket(c.req.raw);
  connectStream(socket);

  return response;
};

export { relayController };
