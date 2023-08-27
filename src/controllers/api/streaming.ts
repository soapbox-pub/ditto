import { AppController } from '@/app.ts';
import { z } from '@/deps.ts';
import { type DittoFilter } from '@/filter.ts';
import { TOKEN_REGEX } from '@/middleware/auth19.ts';
import { Sub } from '@/subs.ts';
import { toStatus } from '@/transformers/nostr-to-mastoapi.ts';

/**
 * Streaming timelines/categories.
 * https://docs.joinmastodon.org/methods/streaming/#streams
 */
const streamSchema = z.enum([
  'nostr',
  'public',
  'public:local',
  'user',
]);

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

  function send(name: string, payload: object) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        event: name,
        payload: JSON.stringify(payload),
        stream: [stream],
      }));
    }
  }

  socket.onopen = async () => {
    if (!stream) return;
    const filter = topicToFilter(stream);

    if (filter) {
      for await (const event of Sub.sub(socket, '1', [filter])) {
        const status = await toStatus(event);
        if (status) {
          send('update', status);
        }
      }
    }
  };

  socket.onclose = () => {
    Sub.close(socket);
  };

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
