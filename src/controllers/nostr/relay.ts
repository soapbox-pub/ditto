import { type Filter } from '@/deps.ts';
import { getFilters } from '@/db/events.ts';
import { jsonSchema } from '@/schema.ts';
import { clientMsgSchema, type ClientREQ } from '@/schemas/nostr.ts';

import type { AppController } from '@/app.ts';

function connectStream(socket: WebSocket) {
  socket.onmessage = (e) => {
    const result = jsonSchema.pipe(clientMsgSchema).safeParse(e.data);

    if (!result.success) {
      socket.send(JSON.stringify(['NOTICE', JSON.stringify(result.error.message)]));
      return;
    }

    const clientMsg = result.data;

    switch (clientMsg[0]) {
      case 'REQ':
        handleReq(clientMsg);
        return;
      default:
        socket.send(JSON.stringify(['NOTICE', 'Unknown command.']));
        return;
    }
  };

  async function handleReq([_, sub, ...filters]: ClientREQ) {
    for (const event of await getFilters(filters as Filter[])) {
      socket.send(JSON.stringify(['EVENT', sub, event]));
    }
    socket.send(JSON.stringify(['EOSE', sub]));
  }
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
