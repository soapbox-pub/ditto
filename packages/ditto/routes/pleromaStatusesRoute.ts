import { paginationMiddleware, userMiddleware } from '@ditto/mastoapi/middleware';
import { DittoRoute } from '@ditto/mastoapi/router';

import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { createEvent } from '@/utils/api.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';
import { HTTPException } from '@hono/hono/http-exception';

import { getCustomEmojis, parseEmojiInput } from '@/utils/custom-emoji.ts';

const route = new DittoRoute();

/*
 * React to a status.
 * https://docs.pleroma.social/backend/development/API/pleroma_api/#put-apiv1pleromastatusesidreactionsemoji
 */
route.put('/:id{[0-9a-f]{64}}/reactions/:emoji', userMiddleware(), async (c) => {
  const { relay, user, conf, signal } = c.var;

  const params = c.req.param();
  const result = parseEmojiParam(params.emoji);
  const pubkey = await user.signer.getPublicKey();

  const [event] = await relay.query([{ ids: [params.id] }], { signal });
  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const tags: string[][] = [
    ['e', event.id, conf.relay, event.pubkey],
    ['p', event.pubkey, conf.relay],
  ];

  if (result.type === 'custom') {
    const emojis = await getCustomEmojis(pubkey, c.var);
    const emoji = emojis.get(result.shortcode);

    if (!emoji) {
      return c.json({ error: 'Custom emoji not found' }, 404);
    }

    tags.push(['emoji', result.shortcode, emoji.url.href]);
  }

  let content: string;

  switch (result.type) {
    case 'native':
      content = result.native;
      break;
    case 'custom':
      content = `:${result.shortcode}:`;
      break;
  }

  await createEvent({ kind: 7, content, tags }, c);
  await hydrateEvents({ ...c.var, events: [event] });

  const status = await renderStatus(relay, event, { viewerPubkey: pubkey });
  return c.json(status);
});

/*
 * Delete reactions to a status.
 * https://docs.pleroma.social/backend/development/API/pleroma_api/#delete-apiv1pleromastatusesidreactionsemoji
 */
route.delete('/:id{[0-9a-f]{64}}/reactions/:emoji', userMiddleware(), async (c) => {
  const { relay, user, signal } = c.var;

  const params = c.req.param();
  const pubkey = await user.signer.getPublicKey();

  const [event] = await relay.query([{ ids: [params.id] }], { signal });

  if (!event) {
    return c.json({ error: 'Status not found' }, 404);
  }

  const events = await relay.query([
    { kinds: [7], authors: [pubkey], '#e': [params.id] },
  ], { signal });

  const e = new Set<string>();

  for (const { id, content } of events) {
    if (content === params.emoji || content === `:${params.emoji}:`) {
      e.add(id);
    }
  }

  if (!e.size) {
    return c.json({ error: 'Reaction not found' }, 404);
  }

  await createEvent({
    kind: 5,
    tags: [...e].map((id) => ['e', id]),
  }, c);

  await hydrateEvents({ ...c.var, events: [event] });

  const status = await renderStatus(relay, event, { viewerPubkey: pubkey });
  return c.json(status);
});

/*
 * Get an object of emoji to account mappings with accounts that reacted to the post.
 * https://docs.pleroma.social/backend/development/API/pleroma_api/#get-apiv1pleromastatusesidreactions
 */
route.get(
  '/:id{[0-9a-f]{64}}/reactions/:emoji?',
  paginationMiddleware({ limit: 100 }),
  userMiddleware({ required: false }),
  async (c) => {
    const { relay, user, pagination, paginate } = c.var;

    const params = c.req.param();
    const result = params.emoji ? parseEmojiParam(params.emoji) : undefined;
    const pubkey = await user?.signer.getPublicKey();

    const events = await relay.query([{ kinds: [7], '#e': [params.id], ...pagination }])
      .then((events) =>
        events.filter((event) => {
          if (!result) return true;

          switch (result.type) {
            case 'native':
              return event.content === result.native;
            case 'custom':
              return event.content === `:${result.shortcode}:`;
          }
        })
      )
      .then((events) => hydrateEvents({ ...c.var, events }));

    /** Events grouped by emoji key. */
    const byEmojiKey = events.reduce((acc, event) => {
      const result = parseEmojiInput(event.content);

      if (!result || result.type === 'basic') {
        return acc;
      }

      let url: URL | undefined;

      if (result.type === 'custom') {
        const tag = event.tags.find(([name, value]) => name === 'emoji' && value === result.shortcode);
        try {
          url = new URL(tag![2]);
        } catch {
          return acc;
        }
      }

      let key: string;
      switch (result.type) {
        case 'native':
          key = result.native;
          break;
        case 'custom':
          key = `${result.shortcode}:${url}`;
          break;
      }

      acc[key] = acc[key] || [];
      acc[key].push(event);

      return acc;
    }, {} as Record<string, DittoEvent[]>);

    const results = await Promise.all(
      Object.entries(byEmojiKey).map(async ([key, events]) => {
        let name: string = key;
        let url: string | undefined;

        // Custom emojis: `<shortcode>:<url>`
        try {
          const [shortcode, ...rest] = key.split(':');

          url = new URL(rest.join(':')).toString();
          name = shortcode;
        } catch {
          // fallthrough
        }

        return {
          name,
          count: events.length,
          me: pubkey && events.some((event) => event.pubkey === pubkey),
          accounts: await Promise.all(
            events.map((event) => event.author ? renderAccount(event.author) : accountFromPubkey(event.pubkey)),
          ),
          url,
        };
      }),
    );

    return paginate(events, results);
  },
);

/** Determine if the input is a native or custom emoji, returning a structured object or throwing an error. */
function parseEmojiParam(input: string):
  | { type: 'native'; native: string }
  | { type: 'custom'; shortcode: string } {
  if (/^\w+$/.test(input)) {
    input = `:${input}:`; // Pleroma API supports the `emoji` param with or without colons.
  }

  const result = parseEmojiInput(input);

  if (!result || result.type === 'basic') {
    throw new HTTPException(400, { message: 'Invalid emoji' });
  }

  return result;
}

export default route;
