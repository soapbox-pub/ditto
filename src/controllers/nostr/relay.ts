import * as eventsDB from '@/db/events.ts';
import * as pipeline from '@/pipeline.ts';
import { jsonSchema } from '@/schema.ts';
import {
  type ClientCLOSE,
  type ClientEVENT,
  type ClientMsg,
  clientMsgSchema,
  type ClientREQ,
} from '@/schemas/nostr.ts';

import type { AppController } from '@/app.ts';
import type { Event, Filter } from '@/deps.ts';

/** Limit of events returned per-filter. */
const FILTER_LIMIT = 100;

/** NIP-01 relay to client message. */
type RelayMsg =
  | ['EVENT', string, Event]
  | ['NOTICE', string]
  | ['EOSE', string]
  | ['OK', string, boolean, string];

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
    }
  }

  /** Handle REQ. Start a subscription. */
  async function handleReq([_, sub, ...filters]: ClientREQ) {
    for (const event of await eventsDB.getFilters(prepareFilters(filters))) {
      send(['EVENT', sub, event]);
    }
    send(['EOSE', sub]);
  }

  /** Handle EVENT. Store the event. */
  async function handleEvent([_, event]: ClientEVENT) {
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
  function handleClose([_, _sub]: ClientCLOSE) {
    // TODO: ???
    return;
  }

  /** Send a message back to the client. */
  function send(msg: RelayMsg) {
    return socket.send(JSON.stringify(msg));
  }
}

/** Enforce the filters with certain criteria. */
function prepareFilters(filters: ClientREQ[2][]): Filter[] {
  return filters.map((filter) => ({
    ...filter,
    // Limit the number of events returned per-filter.
    limit: Math.min(filter.limit || FILTER_LIMIT, FILTER_LIMIT),
    // Return only local events unless the query is already narrow.
    local: !filter.ids?.length && !filter.authors?.length,
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
