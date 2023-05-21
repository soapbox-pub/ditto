import { AppController } from '@/app.ts';
import { TOKEN_REGEX } from '@/middleware/auth.ts';
import ws from '@/stream.ts';
import { bech32ToPubkey } from '@/utils.ts';

const streamingController: AppController = (c) => {
  const upgrade = c.req.headers.get('upgrade');
  const token = c.req.headers.get('sec-websocket-protocol');
  const stream = c.req.query('stream');

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

  socket.addEventListener('open', () => {
    console.log('websocket: connection opened');
    if (stream) {
      ws.subscribe(conn, { name: stream });
    }
  });

  socket.addEventListener('message', (e) => console.log('websocket message: ', e.data));

  socket.addEventListener('close', () => {
    console.log('websocket: connection closed');
    ws.unsubscribe(conn, { name: stream! });
  });

  return response;
};

export { streamingController };
