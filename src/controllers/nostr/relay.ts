import * as eventsDB from '@/db/events.ts';
import * as pipeline from '@/pipeline.ts';
import { jsonSchema } from '@/schema.ts';
import {
  type ClientCLOSE,
  type ClientCOUNT,
  type ClientEVENT,
  type ClientMsg,
  clientMsgSchema,
  type ClientREQ,
} from '@/schemas/nostr.ts';
import { Sub } from '@/subs.ts';

import type { AppController } from '@/app.ts';
import type { Event, Filter } from '@/deps.ts';

/** Limit of initial events returned for a subscription. */
const FILTER_LIMIT = 100;

/** NIP-01 relay to client message. */
type RelayMsg =
  | ['EVENT', string, Event]
  | ['NOTICE', string]
  | ['EOSE', string]
  | ['OK', string, boolean, string]
  | ['COUNT', string, { count: number; approximate?: boolean }];

/** Set up the Websocket connection. */
function connectStream(socket: WebSocket) {
  socket.onmessage = (e) => {
    const result = jsonSchema.pipe(clientMsgSchema).safeParse(e.data);
    if (result.success) {
      handleMsg(result.data);
    } else {
      send(['NOTICE', 'Invalid message.']);
    }
  };

  socket.onclose = () => {
    Sub.close(socket);
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

    for (const event of await eventsDB.getFilters(filters, { limit: FILTER_LIMIT })) {
      send(['EVENT', subId, event]);
    }

    send(['EOSE', subId]);

    for await (const event of Sub.sub(socket, subId, filters)) {
      send(['EVENT', subId, event]);
    }
  }

  /** Handle EVENT. Store the event. */
  async function handleEvent([_, event]: ClientEVENT): Promise<void> {
    try {
      // This will store it (if eligible) and run other side-effects.
      await pipeline.handleEvent(event);
      send(['OK', event.id, true, '']);
    } catch (e) {
      if (e instanceof pipeline.RelayError) {
        send(['OK', event.id, false, e.message]);
      } else {
        send(['OK', event.id, false, 'error: something went wrong']);
      }
    }
  }

  /** Handle CLOSE. Close the subscription. */
  function handleClose([_, subId]: ClientCLOSE): void {
    Sub.unsub(socket, subId);
  }

  /** Handle COUNT. Return the number of events matching the filters. */
  async function handleCount([_, subId, ...rest]: ClientCOUNT): Promise<void> {
    const count = await eventsDB.countFilters(prepareFilters(rest));
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
function prepareFilters(filters: ClientREQ[2][]): Filter[] {
  return filters.map((filter) => ({
    ...filter,
    // Return only local events unless the query is already narrow.
    local: (filter.ids?.length || filter.authors?.length) ? undefined : true,
  }));
}

const relayController: AppController = (c) => {
  const upgrade = c.req.headers.get('upgrade');

  if (upgrade?.toLowerCase() !== 'websocket') {
    return c.text('Please use a Nostr client to connect.', 400);
  }

  const { socket, response } = Deno.upgradeWebSocket(c.req.raw);
  connectStream(socket);

  return response;
};

export { relayController };
