import { MuteListPolicy } from '@ditto/policies';
import {
  streamingClientMessagesCounter,
  streamingConnectionsGauge,
  streamingServerMessagesCounter,
} from '@ditto/metrics';
import TTLCache from '@isaacs/ttlcache';
import { NostrEvent, NostrFilter, NStore } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import { z } from 'zod';

import { type AppController } from '@/app.ts';
import { getFeedPubkeys } from '@/queries.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { errorJson } from '@/utils/log.ts';
import { Time } from '@/utils.ts';
import { renderReblog, renderStatus } from '@/views/mastodon/statuses.ts';
import { renderNotification } from '@/views/mastodon/notifications.ts';

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

/** https://docs.joinmastodon.org/methods/streaming/#events-11 */
interface StreamingEvent {
  /** https://docs.joinmastodon.org/methods/streaming/#events */
  event:
    | 'update'
    | 'delete'
    | 'notification'
    | 'filters_changed'
    | 'conversation'
    | 'announcement'
    | 'announcement.reaction'
    | 'announcement.delete'
    | 'status.update'
    | 'encrypted_message'
    | 'notifications_merged';
  payload: string;
  stream: Stream[];
}

const LIMITER_WINDOW = Time.minutes(5);
const LIMITER_LIMIT = 100;

const limiter = new TTLCache<string, number>();

const connections = new Set<WebSocket>();

const streamingController: AppController = async (c) => {
  const { conf, relay, user, requestId } = c.var;

  const upgrade = c.req.header('upgrade');
  const token = c.req.header('sec-websocket-protocol');
  const stream = streamSchema.optional().catch(undefined).parse(c.req.query('stream'));
  const controller = new AbortController();

  if (upgrade?.toLowerCase() !== 'websocket') {
    return c.text('Please use websocket protocol', 400);
  }

  const ip = c.req.header('x-real-ip');
  if (ip) {
    const count = limiter.get(ip) ?? 0;
    if (count > LIMITER_LIMIT) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }
  }

  const { socket, response } = Deno.upgradeWebSocket(c.req.raw, { protocol: token });

  const pubkey = await user?.signer.getPublicKey();
  const policy = pubkey ? new MuteListPolicy(pubkey, relay) : undefined;

  function send(e: StreamingEvent) {
    if (socket.readyState === WebSocket.OPEN) {
      streamingServerMessagesCounter.inc();
      socket.send(JSON.stringify(e));
    }
  }

  async function sub(
    filter: NostrFilter & { limit: 0 },
    render: (event: NostrEvent) => Promise<StreamingEvent | undefined>,
  ) {
    const { signal } = controller;
    try {
      for await (const msg of relay.req([filter], { signal })) {
        if (msg[0] === 'EVENT') {
          const event = msg[2];

          if (policy) {
            const [, , ok] = await policy.call(event);
            if (!ok) {
              continue;
            }
          }

          await hydrateEvents({ ...c.var, events: [event], signal });

          const result = await render(event);

          if (result) {
            send(result);
          }
        }
      }
    } catch (e) {
      logi({ level: 'error', ns: 'ditto.streaming', msg: 'Error in streaming', requestId, error: errorJson(e) });
    }
  }

  socket.onopen = async () => {
    connections.add(socket);
    streamingConnectionsGauge.set(connections.size);

    if (!stream) return;
    const topicFilter = await topicToFilter(relay, stream, c.req.query(), pubkey, conf.url.host);

    if (topicFilter) {
      sub(topicFilter, async (event) => {
        let payload: object | undefined;

        if (event.kind === 1) {
          payload = await renderStatus(relay, event, { viewerPubkey: pubkey });
        }
        if (event.kind === 6) {
          payload = await renderReblog(relay, event, { viewerPubkey: pubkey });
        }

        if (payload) {
          return {
            event: 'update',
            payload: JSON.stringify(payload),
            stream: [stream],
          };
        }
      });
    }

    if (['user', 'user:notification'].includes(stream) && pubkey) {
      sub({ '#p': [pubkey], limit: 0 }, async (event) => {
        if (event.pubkey === pubkey) return; // skip own events
        const payload = await renderNotification(relay, event, { viewerPubkey: pubkey });
        if (payload) {
          return {
            event: 'notification',
            payload: JSON.stringify(payload),
            stream: [stream],
          } satisfies StreamingEvent;
        }
      });
      return;
    }
  };

  socket.onmessage = (e) => {
    streamingClientMessagesCounter.inc();

    if (ip) {
      const count = limiter.get(ip) ?? 0;
      limiter.set(ip, count + 1, { ttl: LIMITER_WINDOW });

      if (count > LIMITER_LIMIT) {
        closeSocket(1008, 'Rate limit exceeded');
        return;
      }
    }

    if (typeof e.data !== 'string') {
      closeSocket(1003, 'Invalid message');
      return;
    }
  };

  socket.onclose = () => {
    handleClose();
  };

  function closeSocket(code?: number, reason?: string) {
    socket.close(code, reason);
    handleClose();
  }

  function handleClose(): void {
    connections.delete(socket);
    streamingConnectionsGauge.set(connections.size);
    controller.abort();
  }

  return response;
};

async function topicToFilter(
  relay: NStore,
  topic: Stream,
  query: Record<string, string>,
  pubkey: string | undefined,
  host: string,
): Promise<(NostrFilter & { limit: 0 }) | undefined> {
  switch (topic) {
    case 'public':
      return { kinds: [1, 6, 20], limit: 0 };
    case 'public:local':
      return { kinds: [1, 6, 20], search: `domain:${host}`, limit: 0 };
    case 'hashtag':
      if (query.tag) return { kinds: [1, 6, 20], '#t': [query.tag], limit: 0 };
      break;
    case 'hashtag:local':
      if (query.tag) return { kinds: [1, 6, 20], '#t': [query.tag], search: `domain:${host}`, limit: 0 };
      break;
    case 'user':
      // HACK: this puts the user's entire contacts list into RAM,
      // and then calls `matchFilters` over it. Refreshing the page
      // is required after following a new user.
      return pubkey ? { kinds: [1, 6, 20], authors: [...await getFeedPubkeys(relay, pubkey)], limit: 0 } : undefined;
  }
}

export { streamingController };
