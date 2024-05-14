import { NostrEvent, NostrFilter, NSchema as n } from '@nostrify/nostrify';
import ISO6391 from 'iso-639-1';
import { z } from 'zod';

import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { getUnattachedMediaByIds } from '@/db/unattached-media.ts';
import { getAncestors, getAuthor, getDescendants, getEvent } from '@/queries.ts';
import { addTag, deleteTag } from '@/tags.ts';
import { createEvent, paginationSchema, parseBody, updateListEvent } from '@/utils/api.ts';
import { renderEventAccounts } from '@/views.ts';
import { renderReblog, renderStatus } from '@/views/mastodon/statuses.ts';
import { getLnurl } from '@/utils/lnurl.ts';
import { asyncReplaceAll } from '@/utils/text.ts';
import { Storages } from '@/storages.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { lookupPubkey } from '@/utils/lookup.ts';

const createStatusSchema = z.object({
  in_reply_to_id: z.string().regex(/[0-9a-f]{64}/).nullish(),
  language: z.string().refine(ISO6391.validate).nullish(),
  media_ids: z.string().array().nullish(),
  poll: z.object({
    options: z.string().array(),
    expires_in: z.number(),
    multiple: z.boolean().default(false),
    hide_totals: z.boolean().default(false),
  }).nullish(),
  scheduled_at: z.string().datetime().nullish(),
  sensitive: z.boolean().nullish(),
  spoiler_text: z.string().nullish(),
  status: z.string().nullish(),
  to: z.string().array().nullish(),
  visibility: z.enum(['public', 'unlisted', 'private', 'direct']).nullish(),
  quote_id: z.string().nullish(),
}).refine(
  (data) => Boolean(data.status || data.media_ids?.length),
  { message: 'Status must contain text or media.' },
);

const statusController: AppController = async (c) => {
  const id = c.req.param('id');

  const event = await getEvent(id, {
    kind: 1,
    signal: AbortSignal.timeout(1500),
  });

  if (event) {
    return c.json(await renderStatus(event, { viewerPubkey: await c.get('signer')?.getPublicKey() }));
  }

  return c.json({ error: 'Event not found.' }, 404);
};

const createStatusController: AppController = async (c) => {
  const body = await parseBody(c.req.raw);
  const result = createStatusSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 400);
  }

  const { data } = result;

  if (data.visibility !== 'public') {
    return c.json({ error: 'Only posting publicly is supported.' }, 422);
  }

  if (data.poll) {
    return c.json({ error: 'Polls are not yet supported.' }, 422);
  }

  const tags: string[][] = [];

  if (data.quote_id) {
    tags.push(['q', data.quote_id]);
  }

  if (data.in_reply_to_id) {
    tags.push(['e', data.in_reply_to_id, 'reply']);
  }

  if (data.sensitive && data.spoiler_text) {
    tags.push(['content-warning', data.spoiler_text]);
  } else if (data.sensitive) {
    tags.push(['content-warning']);
  } else if (data.spoiler_text) {
    tags.push(['subject', data.spoiler_text]);
  }

  const viewerPubkey = await c.get('signer')?.getPublicKey();

  if (data.media_ids?.length) {
    const media = await getUnattachedMediaByIds(data.media_ids)
      .then((media) => media.filter(({ pubkey }) => pubkey === viewerPubkey))
      .then((media) => media.map(({ url, data }) => ['media', url, data]));

    tags.push(...media);
  }

  const pubkeys = new Set<string>();

  const content = await asyncReplaceAll(data.status ?? '', /@([\w@+._]+)/g, async (match, username) => {
    const pubkey = await lookupPubkey(username);
    if (!pubkey) return match;

    // Content addressing (default)
    if (!data.to) {
      pubkeys.add(pubkey);
    }

    return `nostr:${pubkey}`;
  });

  // Explicit addressing
  for (const to of data.to ?? []) {
    const pubkey = await lookupPubkey(to);
    if (pubkey) {
      pubkeys.add(pubkey);
    }
  }

  for (const pubkey of pubkeys) {
    tags.push(['p', pubkey]);
  }

  for (const match of content.matchAll(/#(\w+)/g)) {
    tags.push(['t', match[1]]);
  }

  const event = await createEvent({
    kind: 1,
    content,
    tags,
  }, c);

  const author = await getAuthor(event.pubkey);

  if (data.quote_id) {
    await hydrateEvents({
      events: [event],
      storage: Storages.db,
      signal: c.req.raw.signal,
    });
  }

  return c.json(await renderStatus({ ...event, author }, { viewerPubkey: await c.get('signer')?.getPublicKey() }));
};

const deleteStatusController: AppController = async (c) => {
  const id = c.req.param('id');
  const pubkey = await c.get('signer')?.getPublicKey();

  const event = await getEvent(id, { signal: c.req.raw.signal });

  if (event) {
    if (event.pubkey === pubkey) {
      await createEvent({
        kind: 5,
        tags: [['e', id]],
      }, c);

      const author = await getAuthor(event.pubkey);
      return c.json(await renderStatus({ ...event, author }, { viewerPubkey: pubkey }));
    } else {
      return c.json({ error: 'Unauthorized' }, 403);
    }
  }

  return c.json({ error: 'Event not found.' }, 404);
};

const contextController: AppController = async (c) => {
  const id = c.req.param('id');
  const event = await getEvent(id, { kind: 1, relations: ['author', 'event_stats', 'author_stats'] });
  const viewerPubkey = await c.get('signer')?.getPublicKey();

  async function renderStatuses(events: NostrEvent[]) {
    const statuses = await Promise.all(
      events.map((event) => renderStatus(event, { viewerPubkey })),
    );
    return statuses.filter(Boolean);
  }

  if (event) {
    const [ancestors, descendants] = await Promise.all([
      getAncestors(event).then(renderStatuses),
      getDescendants(event.id).then(renderStatuses),
    ]);

    return c.json({ ancestors, descendants });
  }

  return c.json({ error: 'Event not found.' }, 404);
};

const favouriteController: AppController = async (c) => {
  const id = c.req.param('id');
  const target = await getEvent(id, { kind: 1, relations: ['author', 'event_stats', 'author_stats'] });

  if (target) {
    await createEvent({
      kind: 7,
      content: '+',
      tags: [
        ['e', target.id],
        ['p', target.pubkey],
      ],
    }, c);

    const status = await renderStatus(target, { viewerPubkey: await c.get('signer')?.getPublicKey() });

    if (status) {
      status.favourited = true;
      status.favourites_count++;
    }

    return c.json(status);
  } else {
    return c.json({ error: 'Event not found.' }, 404);
  }
};

const favouritedByController: AppController = (c) => {
  const id = c.req.param('id');
  const params = paginationSchema.parse(c.req.query());
  return renderEventAccounts(c, [{ kinds: [7], '#e': [id], ...params }]);
};

/** https://docs.joinmastodon.org/methods/statuses/#boost */
const reblogStatusController: AppController = async (c) => {
  const eventId = c.req.param('id');
  const { signal } = c.req.raw;

  const event = await getEvent(eventId, {
    kind: 1,
  });

  if (!event) {
    return c.json({ error: 'Event not found.' }, 404);
  }

  const reblogEvent = await createEvent({
    kind: 6,
    tags: [['e', event.id], ['p', event.pubkey]],
  }, c);

  await hydrateEvents({
    events: [reblogEvent],
    storage: Storages.db,
    signal: signal,
  });

  const status = await renderReblog(reblogEvent, { viewerPubkey: await c.get('signer')?.getPublicKey() });

  return c.json(status);
};

/** https://docs.joinmastodon.org/methods/statuses/#unreblog */
const unreblogStatusController: AppController = async (c) => {
  const eventId = c.req.param('id');
  const pubkey = await c.get('signer')?.getPublicKey() as string;

  const event = await getEvent(eventId, {
    kind: 1,
  });
  if (!event) return c.json({ error: 'Event not found.' }, 404);

  const filters: NostrFilter[] = [{ kinds: [6], authors: [pubkey], '#e': [event.id] }];
  const [repostedEvent] = await Storages.db.query(filters, { limit: 1 });
  if (!repostedEvent) return c.json({ error: 'Event not found.' }, 404);

  await createEvent({
    kind: 5,
    tags: [['e', repostedEvent.id]],
  }, c);

  return c.json(await renderStatus(event, {}));
};

const rebloggedByController: AppController = (c) => {
  const id = c.req.param('id');
  const params = paginationSchema.parse(c.req.query());
  return renderEventAccounts(c, [{ kinds: [6], '#e': [id], ...params }]);
};

/** https://docs.joinmastodon.org/methods/statuses/#bookmark */
const bookmarkController: AppController = async (c) => {
  const pubkey = await c.get('signer')?.getPublicKey()!;
  const eventId = c.req.param('id');

  const event = await getEvent(eventId, {
    kind: 1,
    relations: ['author', 'event_stats', 'author_stats'],
  });

  if (event) {
    await updateListEvent(
      { kinds: [10003], authors: [pubkey] },
      (tags) => addTag(tags, ['e', eventId]),
      c,
    );

    const status = await renderStatus(event, { viewerPubkey: pubkey });
    if (status) {
      status.bookmarked = true;
    }
    return c.json(status);
  } else {
    return c.json({ error: 'Event not found.' }, 404);
  }
};

/** https://docs.joinmastodon.org/methods/statuses/#unbookmark */
const unbookmarkController: AppController = async (c) => {
  const pubkey = await c.get('signer')?.getPublicKey()!;
  const eventId = c.req.param('id');

  const event = await getEvent(eventId, {
    kind: 1,
    relations: ['author', 'event_stats', 'author_stats'],
  });

  if (event) {
    await updateListEvent(
      { kinds: [10003], authors: [pubkey] },
      (tags) => deleteTag(tags, ['e', eventId]),
      c,
    );

    const status = await renderStatus(event, { viewerPubkey: pubkey });
    if (status) {
      status.bookmarked = false;
    }
    return c.json(status);
  } else {
    return c.json({ error: 'Event not found.' }, 404);
  }
};

/** https://docs.joinmastodon.org/methods/statuses/#pin */
const pinController: AppController = async (c) => {
  const pubkey = await c.get('signer')?.getPublicKey()!;
  const eventId = c.req.param('id');

  const event = await getEvent(eventId, {
    kind: 1,
    relations: ['author', 'event_stats', 'author_stats'],
  });

  if (event) {
    await updateListEvent(
      { kinds: [10001], authors: [pubkey] },
      (tags) => addTag(tags, ['e', eventId]),
      c,
    );

    const status = await renderStatus(event, { viewerPubkey: pubkey });
    if (status) {
      status.pinned = true;
    }
    return c.json(status);
  } else {
    return c.json({ error: 'Event not found.' }, 404);
  }
};

/** https://docs.joinmastodon.org/methods/statuses/#unpin */
const unpinController: AppController = async (c) => {
  const pubkey = await c.get('signer')?.getPublicKey()!;
  const eventId = c.req.param('id');
  const { signal } = c.req.raw;

  const event = await getEvent(eventId, {
    kind: 1,
    relations: ['author', 'event_stats', 'author_stats'],
    signal,
  });

  if (event) {
    await updateListEvent(
      { kinds: [10001], authors: [pubkey] },
      (tags) => deleteTag(tags, ['e', eventId]),
      c,
    );

    const status = await renderStatus(event, { viewerPubkey: pubkey });
    if (status) {
      status.pinned = false;
    }
    return c.json(status);
  } else {
    return c.json({ error: 'Event not found.' }, 404);
  }
};

const zapSchema = z.object({
  amount: z.number().int().positive(),
  comment: z.string().optional(),
});

const zapController: AppController = async (c) => {
  const id = c.req.param('id');
  const body = await parseBody(c.req.raw);
  const params = zapSchema.safeParse(body);
  const { signal } = c.req.raw;

  if (!params.success) {
    return c.json({ error: 'Bad request', schema: params.error }, 400);
  }

  const target = await getEvent(id, { kind: 1, relations: ['author', 'event_stats', 'author_stats'], signal });
  const author = target?.author;
  const meta = n.json().pipe(n.metadata()).catch({}).parse(author?.content);
  const lnurl = getLnurl(meta);

  if (target && lnurl) {
    await createEvent({
      kind: 9734,
      content: params.data.comment ?? '',
      tags: [
        ['e', target.id],
        ['p', target.pubkey],
        ['amount', params.data.amount.toString()],
        ['relays', Conf.relay],
        ['lnurl', lnurl],
      ],
    }, c);

    const status = await renderStatus(target, { viewerPubkey: await c.get('signer')?.getPublicKey() });
    status.zapped = true;

    return c.json(status);
  } else {
    return c.json({ error: 'Event not found.' }, 404);
  }
};

export {
  bookmarkController,
  contextController,
  createStatusController,
  deleteStatusController,
  favouriteController,
  favouritedByController,
  pinController,
  rebloggedByController,
  reblogStatusController,
  statusController,
  unbookmarkController,
  unpinController,
  unreblogStatusController,
  zapController,
};
