import { userMiddleware } from '@ditto/mastoapi/middleware';
import { DittoRoute } from '@ditto/mastoapi/router';

import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { createEvent } from '@/utils/api.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';
import { HTTPException } from '@hono/hono/http-exception';

import { getCustomEmojis } from '@/utils/custom-emoji.ts';

const route = new DittoRoute();

/*
 * React to a status.
 * https://docs.pleroma.social/backend/development/API/pleroma_api/#put-apiv1pleromastatusesidreactionsemoji
 */
route.put('/:id{[0-9a-f]{64}}/reactions/:emoji', userMiddleware(), async (c) => {
  const params = c.req.param();

  const { relay, user, conf, signal } = c.var;
  const { type, value } = parseEmojiParam(params.emoji);

  const pubkey = await user.signer.getPublicKey();

  const [event] = await relay.query([{ ids: [params.id] }], { signal });
  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const tags: string[][] = [
    ['e', event.id, conf.relay, event.pubkey],
    ['p', event.pubkey, conf.relay],
  ];

  if (type === 'custom') {
    const emojis = await getCustomEmojis(pubkey, c.var);
    const emoji = emojis.get(value);

    if (!emoji) {
      return c.json({ error: 'Custom emoji not found' }, 404);
    }

    tags.push(['emoji', value, emoji.url.href]);
  }

  const content = type === 'custom' ? `:${value}:` : value;

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
  const { id, emoji } = c.req.param();
  const { relay, user, signal } = c.var;

  const pubkey = await user.signer.getPublicKey();

  if (!/^\p{RGI_Emoji}$/v.test(emoji)) {
    return c.json({ error: 'Invalid emoji' }, 400);
  }

  const [event] = await relay.query([{ ids: [id] }], { signal });

  if (!event) {
    return c.json({ error: 'Status not found' }, 404);
  }

  const events = await relay.query([
    { kinds: [7], authors: [pubkey], '#e': [id] },
  ]);

  const tags = events
    .filter((event) => event.content === emoji)
    .map((event) => ['e', event.id]);

  await createEvent({
    kind: 5,
    content: '',
    created_at: Math.floor(Date.now() / 1000),
    tags,
  }, c);

  const status = await renderStatus(relay, event, { viewerPubkey: pubkey });
  return c.json(status);
});

/*
 * Get an object of emoji to account mappings with accounts that reacted to the post.
 * https://docs.pleroma.social/backend/development/API/pleroma_api/#get-apiv1pleromastatusesidreactions
 */
route.get('/:id{[0-9a-f]{64}}/reactions/:emoji?', userMiddleware({ required: false }), async (c) => {
  const { id, emoji } = c.req.param();
  const { relay, user } = c.var;

  const pubkey = await user?.signer.getPublicKey();

  if (typeof emoji === 'string' && !/^\p{RGI_Emoji}$/v.test(emoji)) {
    return c.json({ error: 'Invalid emoji' }, 400);
  }

  const events = await relay.query([{ kinds: [7], '#e': [id], limit: 100 }])
    .then((events) => events.filter(({ content }) => /^\p{RGI_Emoji}$/v.test(content)))
    .then((events) => events.filter((event) => !emoji || event.content === emoji))
    .then((events) => hydrateEvents({ ...c.var, events }));

  /** Events grouped by emoji. */
  const byEmoji = events.reduce((acc, event) => {
    const emoji = event.content;
    acc[emoji] = acc[emoji] || [];
    acc[emoji].push(event);
    return acc;
  }, {} as Record<string, DittoEvent[]>);

  const results = await Promise.all(
    Object.entries(byEmoji).map(async ([name, events]) => {
      return {
        name,
        count: events.length,
        me: pubkey && events.some((event) => event.pubkey === pubkey),
        accounts: await Promise.all(
          events.map((event) => event.author ? renderAccount(event.author) : accountFromPubkey(event.pubkey)),
        ),
      };
    }),
  );

  return c.json(results);
});

/** Determine if the input is a native or custom emoji, returning a structured object or throwing an error. */
function parseEmojiParam(input: string): { type: 'native' | 'custom'; value: string } {
  if (/^\p{RGI_Emoji}$/v.test(input)) {
    return { type: 'native', value: input };
  }

  if (/^\w+$/.test(input)) {
    return { type: 'custom', value: input };
  }

  throw new HTTPException(400, { message: 'Invalid emoji' });
}

export default route;
