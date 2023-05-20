import { AppController } from '@/app.ts';
import { nip19 } from '@/deps.ts';
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

  if (!nip19.BECH32_REGEX.test(token)) {
    return c.json({ error: 'Invalid access token' }, 401);
  }

  const { socket, response } = Deno.upgradeWebSocket(c.req.raw, { protocol: token });

  socket.addEventListener('open', () => console.log('websocket: connection opened'));
  socket.addEventListener('close', () => console.log('websocket: connection closed'));
  socket.addEventListener('message', (e) => console.log('websocket message: ', e.data));

  if (stream === 'user' && nostr === 'true') {
    signStreams.set(token, socket);
  }

  return response;
};

export { streamingController };
