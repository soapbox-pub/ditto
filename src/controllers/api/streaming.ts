import { AppController } from '@/app.ts';
import { type Event } from '@/deps.ts';
import { type DittoFilter } from '@/filter.ts';
import { TOKEN_REGEX } from '@/middleware/auth19.ts';
import { streamSchema, ws } from '@/stream.ts';
import { Sub } from '@/subs.ts';
import { toStatus } from '@/transformers/nostr-to-mastoapi.ts';
import { bech32ToPubkey } from '@/utils.ts';

const streamingController: AppController = (c) => {
  const upgrade = c.req.headers.get('upgrade');
  const token = c.req.headers.get('sec-websocket-protocol');
  const stream = streamSchema.optional().catch(undefined).parse(c.req.query('stream'));

  if (upgrade?.toLowerCase() !== 'websocket') {
    return c.text('Please use websocket protocol', 400);
  }

  if (!token) {
    return c.json({ error: 'Missing access token' }, 401);
  }

  const match = token.match(new RegExp(`^${TOKEN_REGEX.source}$`));
  if (!match) {
    return c.json({ error: 'Invalid access token' }, 401);
  }

  const { socket, response } = Deno.upgradeWebSocket(c.req.raw, { protocol: token });

  const conn = {
    socket,
    session: match[2],
    pubkey: bech32ToPubkey(match[1]),
  };

  function send(name: string, payload: object) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        event: name,
        payload: JSON.stringify(payload),
      }));
    }
  }

  socket.addEventListener('open', async () => {
    console.log('websocket: connection opened');
    if (!stream) return;

    ws.subscribe(conn, { stream });

    const filter = topicToFilter(stream);

    if (filter) {
      for await (const event of Sub.sub(socket, '1', [filter])) {
        const status = await toStatus(event);
        if (status) {
          send('update', status);
        }
      }
    }
  });

  socket.addEventListener('message', (e) => console.log('websocket message: ', e.data));

  socket.addEventListener('close', () => {
    console.log('websocket: connection closed');
    ws.unsubscribeAll(socket);
  });

  return response;
};

function topicToFilter(topic: string): DittoFilter<1> | undefined {
  switch (topic) {
    case 'public':
      return { kinds: [1] };
    case 'public:local':
      return { kinds: [1], local: true };
  }
}

export { streamingController };
