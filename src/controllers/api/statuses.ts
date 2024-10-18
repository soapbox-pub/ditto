import { HTTPException } from '@hono/hono/http-exception';
import { NostrEvent, NSchema as n } from '@nostrify/nostrify';
import 'linkify-plugin-hashtag';
import linkify from 'linkifyjs';
import { nip19 } from 'nostr-tools';
import { z } from 'zod';

import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { DittoUpload, dittoUploads } from '@/DittoUploads.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { getAncestors, getAuthor, getDescendants, getEvent } from '@/queries.ts';
import { addTag, deleteTag } from '@/utils/tags.ts';
import { asyncReplaceAll } from '@/utils/text.ts';
import { lookupPubkey } from '@/utils/lookup.ts';
import { languageSchema } from '@/schema.ts';
import { Storages } from '@/storages.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { createEvent, paginated, paginatedList, parseBody, updateListEvent } from '@/utils/api.ts';
import { getInvoice, getLnurl } from '@/utils/lnurl.ts';
import { purifyEvent } from '@/utils/purify.ts';
import { getZapSplits } from '@/utils/zap-split.ts';
import { renderEventAccounts } from '@/views.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { renderReblog, renderStatus } from '@/views/mastodon/statuses.ts';

const createStatusSchema = z.object({
  in_reply_to_id: n.id().nullish(),
  language: languageSchema.nullish(),
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
  quote_id: n.id().nullish(),
}).refine(
  (data) => Boolean(data.status || data.media_ids?.length),
  { message: 'Status must contain text or media.' },
);

const statusController: AppController = async (c) => {
  const id = c.req.param('id');

  const event = await getEvent(id, {
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
  const store = c.get('store');

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

  if (data.in_reply_to_id) {
    const ancestor = await getEvent(data.in_reply_to_id);

    if (!ancestor) {
      return c.json({ error: 'Original post not found.' }, 404);
    }

    const rootId = ancestor.tags.find((tag) => tag[0] === 'e' && tag[3] === 'root')?.[1] ?? ancestor.id;
    const root = rootId === ancestor.id ? ancestor : await getEvent(rootId);

    if (root) {
      tags.push(['e', root.id, Conf.relay, 'root', root.pubkey]);
    } else {
      tags.push(['e', rootId, Conf.relay, 'root']);
    }

    tags.push(['e', ancestor.id, Conf.relay, 'reply', ancestor.pubkey]);
  }

  let quoted: DittoEvent | undefined;

  if (data.quote_id) {
    quoted = await getEvent(data.quote_id);

    if (!quoted) {
      return c.json({ error: 'Quoted post not found.' }, 404);
    }

    tags.push(['q', quoted.id, Conf.relay, '', quoted.pubkey]);
  }

  if (data.sensitive && data.spoiler_text) {
    tags.push(['content-warning', data.spoiler_text]);
  } else if (data.sensitive) {
    tags.push(['content-warning']);
  } else if (data.spoiler_text) {
    tags.push(['subject', data.spoiler_text]);
  }

  if (data.language) {
    tags.push(['L', 'ISO-639-1']);
    tags.push(['l', data.language, 'ISO-639-1']);
  }

  const media: DittoUpload[] = (data.media_ids ?? []).map((id) => {
    const upload = dittoUploads.get(id);

    if (!upload) {
      throw new HTTPException(422, { message: 'Uploaded attachment is no longer available.' });
    }

    return upload;
  });

  const imeta: string[][] = media.map(({ tags }) => {
    const values: string[] = tags.map((tag) => tag.join(' '));
    return ['imeta', ...values];
  });

  tags.push(...imeta);

  const pubkeys = new Set<string>();

  const content = await asyncReplaceAll(
    data.status ?? '',
    /(?<![\w/])@([\w@+._]+)(?![\w/\.])/g,
    async (match, username) => {
      const pubkey = await lookupPubkey(username);
      if (!pubkey) return match;

      // Content addressing (default)
      if (!data.to) {
        pubkeys.add(pubkey);
      }

      try {
        return `nostr:${nip19.nprofileEncode({ pubkey, relays: [Conf.relay] })}`;
      } catch {
        return match;
      }
    },
  );

  // Explicit addressing
  for (const to of data.to ?? []) {
    const pubkey = await lookupPubkey(to);
    if (pubkey) {
      pubkeys.add(pubkey);
    }
  }

  for (const pubkey of pubkeys) {
    tags.push(['p', pubkey, Conf.relay]);
  }

  for (const link of linkify.find(data.status ?? '')) {
    if (link.type === 'url' && link.href.startsWith('https://')) {
      tags.push(['r', link.href]);
    }
    if (link.type === 'hashtag') {
      tags.push(['t', link.href.replace(/^#/, '').toLowerCase()]);
    }
  }

  const mediaUrls: string[] = media
    .map(({ url }) => url)
    .filter((url): url is string => Boolean(url));

  const quoteCompat = quoted
    ? `\n\nnostr:${
      nip19.neventEncode({ id: quoted.id, kind: quoted.kind, author: quoted.pubkey, relays: [Conf.relay] })
    }`
    : '';

  const mediaCompat = mediaUrls.length ? `\n\n${mediaUrls.join('\n')}` : '';

  const pubkey = await c.get('signer')?.getPublicKey()!;
  const author = pubkey ? await getAuthor(pubkey) : undefined;

  if (Conf.zapSplitsEnabled) {
    const meta = n.json().pipe(n.metadata()).catch({}).parse(author?.content);
    const lnurl = getLnurl(meta);
    const dittoZapSplit = await getZapSplits(store, Conf.pubkey);
    if (lnurl && dittoZapSplit) {
      let totalSplit = 0;
      for (const pubkey in dittoZapSplit) {
        totalSplit += dittoZapSplit[pubkey].weight;
        tags.push(['zap', pubkey, Conf.relay, dittoZapSplit[pubkey].weight.toString(), dittoZapSplit[pubkey].message]);
      }
      if (totalSplit) {
        tags.push(['zap', pubkey, Conf.relay, Math.max(0, 100 - totalSplit).toString()]);
      }
    }
  }

  const event = await createEvent({
    kind: 1,
    content: content + quoteCompat + mediaCompat,
    tags,
  }, c);

  if (data.quote_id) {
    await hydrateEvents({
      events: [event],
      store: await Storages.db(),
      signal: c.req.raw.signal,
    });
  }

  return c.json(await renderStatus({ ...event, author }, { viewerPubkey: author?.pubkey }));
};

const deleteStatusController: AppController = async (c) => {
  const id = c.req.param('id');
  const pubkey = await c.get('signer')?.getPublicKey();

  const event = await getEvent(id, { signal: c.req.raw.signal });

  if (event) {
    if (event.pubkey === pubkey) {
      await createEvent({
        kind: 5,
        tags: [['e', id, Conf.relay, '', pubkey]],
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
  const store = c.get('store');
  const event = await getEvent(id, { kind: 1, relations: ['author', 'event_stats', 'author_stats'] });
  const viewerPubkey = await c.get('signer')?.getPublicKey();

  async function renderStatuses(events: NostrEvent[]) {
    const statuses = await Promise.all(
      events.map((event) => renderStatus(event, { viewerPubkey })),
    );
    return statuses.filter(Boolean);
  }

  if (event) {
    const [ancestorEvents, descendantEvents] = await Promise.all([
      getAncestors(store, event),
      getDescendants(store, event),
    ]);

    await hydrateEvents({
      events: [...ancestorEvents, ...descendantEvents],
      signal: c.req.raw.signal,
      store,
    });

    const [ancestors, descendants] = await Promise.all([
      renderStatuses(ancestorEvents),
      renderStatuses(descendantEvents.reverse()),
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
        ['e', target.id, Conf.relay, '', target.pubkey],
        ['p', target.pubkey, Conf.relay],
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
  const params = c.get('pagination');

  return renderEventAccounts(c, [{ kinds: [7], '#e': [id], ...params }], {
    filterFn: ({ content }) => content === '+',
  });
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
    tags: [
      ['e', event.id, Conf.relay, '', event.pubkey],
      ['p', event.pubkey, Conf.relay],
    ],
  }, c);

  await hydrateEvents({
    events: [reblogEvent],
    store: await Storages.db(),
    signal: signal,
  });

  const status = await renderReblog(reblogEvent, { viewerPubkey: await c.get('signer')?.getPublicKey() });

  return c.json(status);
};

/** https://docs.joinmastodon.org/methods/statuses/#unreblog */
const unreblogStatusController: AppController = async (c) => {
  const eventId = c.req.param('id');
  const pubkey = await c.get('signer')?.getPublicKey()!;
  const store = await Storages.db();

  const [event] = await store.query([{ ids: [eventId], kinds: [1] }]);
  if (!event) {
    return c.json({ error: 'Record not found' }, 404);
  }

  const [repostEvent] = await store.query(
    [{ kinds: [6], authors: [pubkey], '#e': [event.id], limit: 1 }],
  );

  if (!repostEvent) {
    return c.json({ error: 'Record not found' }, 404);
  }

  await createEvent({
    kind: 5,
    tags: [['e', repostEvent.id, Conf.relay, '', repostEvent.pubkey]],
  }, c);

  return c.json(await renderStatus(event, { viewerPubkey: pubkey }));
};

const rebloggedByController: AppController = (c) => {
  const id = c.req.param('id');
  const params = c.get('pagination');
  return renderEventAccounts(c, [{ kinds: [6], '#e': [id], ...params }]);
};

const quotesController: AppController = async (c) => {
  const id = c.req.param('id');
  const params = c.get('pagination');
  const store = await Storages.db();

  const [event] = await store.query([{ ids: [id], kinds: [1] }]);
  if (!event) {
    return c.json({ error: 'Event not found.' }, 404);
  }

  const quotes = await store
    .query([{ kinds: [1], '#q': [event.id], ...params }])
    .then((events) => hydrateEvents({ events, store }));

  const viewerPubkey = await c.get('signer')?.getPublicKey();

  const statuses = await Promise.all(
    quotes.map((event) => renderStatus(event, { viewerPubkey })),
  );

  if (!statuses.length) {
    return c.json([]);
  }

  return paginated(c, quotes, statuses);
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
      { kinds: [10003], authors: [pubkey], limit: 1 },
      (tags) => addTag(tags, ['e', event.id, Conf.relay, '', event.pubkey]),
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
      { kinds: [10003], authors: [pubkey], limit: 1 },
      (tags) => deleteTag(tags, ['e', event.id, Conf.relay, '', event.pubkey]),
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
      { kinds: [10001], authors: [pubkey], limit: 1 },
      (tags) => addTag(tags, ['e', event.id, Conf.relay, '', event.pubkey]),
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
      { kinds: [10001], authors: [pubkey], limit: 1 },
      (tags) => deleteTag(tags, ['e', event.id, Conf.relay, '', event.pubkey]),
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
  account_id: n.id(),
  status_id: n.id().optional(),
  amount: z.number().int().positive(),
  comment: z.string().optional(),
});

const zapController: AppController = async (c) => {
  const body = await parseBody(c.req.raw);
  const result = zapSchema.safeParse(body);
  const { signal } = c.req.raw;
  const store = c.get('store');

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 400);
  }

  const { account_id, status_id, amount, comment } = result.data;

  const tags: string[][] = [];
  let target: undefined | DittoEvent;
  let lnurl: undefined | string;

  if (status_id) {
    target = await getEvent(status_id, { kind: 1, relations: ['author'], signal });
    const author = target?.author;
    const meta = n.json().pipe(n.metadata()).catch({}).parse(author?.content);
    lnurl = getLnurl(meta);
    if (target && lnurl) {
      tags.push(
        ['e', target.id, Conf.relay],
        ['p', target.pubkey, Conf.relay],
        ['amount', amount.toString()],
        ['relays', Conf.relay],
        ['lnurl', lnurl],
      );
    }
  } else {
    [target] = await store.query([{ authors: [account_id], kinds: [0], limit: 1 }]);
    const meta = n.json().pipe(n.metadata()).catch({}).parse(target?.content);
    lnurl = getLnurl(meta);
    if (target && lnurl) {
      tags.push(
        ['p', target.pubkey, Conf.relay],
        ['amount', amount.toString()],
        ['relays', Conf.relay],
        ['lnurl', lnurl],
      );
    }
  }

  if (target && lnurl) {
    const nostr = await createEvent({
      kind: 9734,
      content: comment ?? '',
      tags,
    }, c);

    return c.json({ invoice: await getInvoice({ amount, nostr: purifyEvent(nostr), lnurl }, signal) });
  } else {
    return c.json({ error: 'Event not found.' }, 404);
  }
};

const zappedByController: AppController = async (c) => {
  const id = c.req.param('id');
  const params = c.get('listPagination');
  const store = await Storages.db();
  const kysely = await Storages.kysely();

  const zaps = await kysely.selectFrom('event_zaps')
    .selectAll()
    .where('target_event_id', '=', id)
    .orderBy('amount_millisats', 'desc')
    .limit(params.limit)
    .offset(params.offset).execute();

  const authors = await store.query([{ kinds: [0], authors: zaps.map((zap) => zap.sender_pubkey) }]);

  const results = (await Promise.all(
    zaps.map(async (zap) => {
      const amount = zap.amount_millisats;
      const comment = zap.comment;

      const sender = authors.find((author) => author.pubkey === zap.sender_pubkey);
      const account = sender ? await renderAccount(sender) : await accountFromPubkey(zap.sender_pubkey);

      return {
        comment,
        amount,
        account,
      };
    }),
  )).filter(Boolean);

  return paginatedList(c, params, results);
};

export {
  bookmarkController,
  contextController,
  createStatusController,
  deleteStatusController,
  favouriteController,
  favouritedByController,
  pinController,
  quotesController,
  rebloggedByController,
  reblogStatusController,
  statusController,
  unbookmarkController,
  unpinController,
  unreblogStatusController,
  zapController,
  zappedByController,
};
