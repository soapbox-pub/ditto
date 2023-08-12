import { getFilters } from '@/db/events.ts';
import { jsonSchema } from '@/schema.ts';
import { type ClientMsg, clientMsgSchema, type ClientREQ } from '@/schemas/nostr.ts';

import type { AppController } from '@/app.ts';
import type { Filter } from '@/deps.ts';
import type { SignedEvent } from '@/event.ts';

/** Limit of events returned per-filter. */
const FILTER_LIMIT = 100;

type RelayMsg =
  | ['EVENT', string, SignedEvent]
  | ['NOTICE', string]
  | ['EOSE', string];

function connectStream(socket: WebSocket) {
  socket.onmessage = (e) => {
    const result = jsonSchema.pipe(clientMsgSchema).safeParse(e.data);
    if (result.success) {
      handleClientMsg(result.data);
    } else {
      send(['NOTICE', 'Invalid message.']);
    }
  };

  function handleClientMsg(msg: ClientMsg) {
    switch (msg[0]) {
      case 'REQ':
        handleReq(msg);
        return;
      case 'EVENT':
        send(['NOTICE', 'EVENT not yet implemented.']);
        return;
      case 'CLOSE':
        return;
    }
  }

  async function handleReq([_, sub, ...filters]: ClientREQ) {
    for (const event of await getFilters(prepareFilters(filters))) {
      send(['EVENT', sub, event]);
    }
    send(['EOSE', sub]);
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
