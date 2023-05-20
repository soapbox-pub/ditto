import { AppController } from '@/app.ts';
import { nip19 } from '@/deps.ts';
import { TOKEN_REGEX } from '@/middleware/auth.ts';
import { signStreams } from '@/sign.ts';

const streamingController: AppController = (c) => {
  const upgrade = c.req.headers.get('upgrade');
  const token = c.req.headers.get('sec-websocket-protocol');

  const stream = c.req.query('stream');
  const nostr = c.req.query('nostr');

  if (upgrade?.toLowerCase() !== 'websocket') {
    return c.text('Please use websocket protocol', 400);
  }

  if (!token) {
    return c.json({ error: 'Missing access token' }, 401);
  }

  if (!(new RegExp(`^${TOKEN_REGEX.source}$`)).test(token)) {
    return c.json({ error: 'Invalid access token' }, 401);
  }

  const { socket, response } = Deno.upgradeWebSocket(c.req.raw, { protocol: token });

  socket.addEventListener('open', () => {
    console.log('websocket: connection opened');
    // Only send signing events if the user has a session ID.
    if (stream === 'user' && nostr === 'true' && new RegExp(`^${nip19.BECH32_REGEX.source}_\\w+$`).test(token)) {
      signStreams.set(token, socket);
    }
  });

  socket.addEventListener('message', (e) => console.log('websocket message: ', e.data));

  socket.addEventListener('close', () => {
    signStreams.delete(token);
    console.log('websocket: connection closed');
  });

  return response;
};

export { streamingController };
