import { NostrFilter } from '@soapbox/nspec';
import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { Debug, z } from '@/deps.ts';
import { getAuthor, getFeedPubkeys } from '@/queries.ts';
import { Sub } from '@/subs.ts';
import { bech32ToPubkey } from '@/utils.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';

const debug = Debug('ditto:streaming');

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
  const upgrade = c.req.header('upgrade');
  const token = c.req.header('sec-websocket-protocol');
  const stream = streamSchema.optional().catch(undefined).parse(c.req.query('stream'));

  if (upgrade?.toLowerCase() !== 'websocket') {
    return c.text('Please use websocket protocol', 400);
  }

  const pubkey = token ? bech32ToPubkey(token) : undefined;
  if (token && !pubkey) {
    return c.json({ error: 'Invalid access token' }, 401);
  }

  const { socket, response } = Deno.upgradeWebSocket(c.req.raw, { protocol: token });

  function send(name: string, payload: object) {
    if (socket.readyState === WebSocket.OPEN) {
      debug('send', name, JSON.stringify(payload));
      socket.send(JSON.stringify({
        event: name,
        payload: JSON.stringify(payload),
        stream: [stream],
      }));
    }
  }

  socket.onopen = async () => {
    if (!stream) return;
    const filter = await topicToFilter(stream, c.req.query(), pubkey);

    if (filter) {
      for await (const event of Sub.sub(socket, '1', [filter])) {
        const status = await renderStatus(event, pubkey);
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

async function topicToFilter(
  topic: Stream,
  query: Record<string, string>,
  pubkey: string | undefined,
): Promise<NostrFilter | undefined> {
  const { host } = Conf.url;

  switch (topic) {
    case 'public':
      return { kinds: [1] };
    case 'public:local':
      return { kinds: [1], search: `domain:${host}` };
    case 'hashtag':
      if (query.tag) return { kinds: [1], '#t': [query.tag] };
      break;
    case 'hashtag:local':
      if (query.tag) return { kinds: [1], '#t': [query.tag], search: `domain:${host}` };
      break;
    case 'user':
      // HACK: this puts the user's entire contacts list into RAM,
      // and then calls `matchFilters` over it. Refreshing the page
      // is required after following a new user.
      return pubkey ? { kinds: [1], authors: await getFeedPubkeys(pubkey) } : undefined;
  }
}

export { streamingController };
