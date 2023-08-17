import * as eventsDB from '@/db/events.ts';
import { findUser } from '@/db/users.ts';
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

type RelayMsg =
  | ['EVENT', string, Event]
  | ['NOTICE', string]
  | ['EOSE', string]
  | ['OK', string, boolean, string];

function connectStream(socket: WebSocket) {
  socket.onmessage = (e) => {
    const result = jsonSchema.pipe(clientMsgSchema).safeParse(e.data);
    if (result.success) {
      handleMsg(result.data);
    } else {
      send(['NOTICE', 'Invalid message.']);
    }
  };

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

  async function handleReq([_, sub, ...filters]: ClientREQ) {
    for (const event of await eventsDB.getFilters(prepareFilters(filters))) {
      send(['EVENT', sub, event]);
    }
    send(['EOSE', sub]);
  }

  async function handleEvent([_, event]: ClientEVENT) {
    if (await findUser({ pubkey: event.pubkey })) {
      eventsDB.insertEvent(event);
      send(['OK', event.id, true, '']);
    } else {
      send(['OK', event.id, false, 'blocked: only registered users can post']);
    }
  }

  function handleClose([_, _sub]: ClientCLOSE) {
    // TODO: ???
    return;
  }

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
