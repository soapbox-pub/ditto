import { type AppController } from '@/app.ts';
import { nip19, z } from '@/deps.ts';
import { type DittoFilter } from '@/filter.ts';
import { Sub } from '@/subs.ts';
import { toStatus } from '@/transformers/nostr-to-mastoapi.ts';

/**
 * Streaming timelines/categories.
 * https://docs.joinmastodon.org/methods/streaming/#streams
 */
const streamSchema = z.enum([
  'public',
  'public:media',
  'public:local',
  'public:local:media',
  'public:remote',
  'public:remote:media',
  'hashtag',
  'hashtag:local',
  'user',
  'user:notification',
  'list',
  'direct',
]);

type Stream = z.infer<typeof streamSchema>;

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

  const match = token.match(new RegExp(`^${nip19.BECH32_REGEX.source}$`));
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
    const filter = topicToFilter(stream, c.req.query());

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

function topicToFilter(topic: Stream, query?: Record<string, string>): DittoFilter<1> | undefined {
  switch (topic) {
    case 'public':
      return { kinds: [1] };
    case 'public:local':
      return { kinds: [1], local: true };
    case 'hashtag':
      if (query?.tag) return { kinds: [1], '#t': [query.tag] };
      break;
    case 'hashtag:local':
      if (query?.tag) return { kinds: [1], local: true, '#t': [query.tag] };
      break;
  }
}

export { streamingController };
