import { NostrEvent, NostrFilter, NSchema as n } from '@nostrify/nostrify';
import { HTTPException } from '@hono/hono/http-exception';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { dittoUploads } from '@/DittoUploads.ts';
import { addTag } from '@/utils/tags.ts';
import { getAuthor } from '@/queries.ts';
import { createEvent, paginated, parseBody, updateEvent } from '@/utils/api.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';
import { deleteTag } from '@/utils/tags.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { DittoZapSplits, getZapSplits } from '@/utils/zap-split.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { screenshotsSchema } from '@/schemas/nostr.ts';
import { booleanParamSchema, percentageSchema } from '@/schema.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { renderNameRequest } from '@/views/ditto.ts';
import { accountFromPubkey } from '@/views/mastodon/accounts.ts';
import { renderAttachment } from '@/views/mastodon/attachments.ts';
import { renderAccount } from '@/views/mastodon/accounts.ts';
import { Storages } from '@/storages.ts';
import { updateListAdminEvent } from '@/utils/api.ts';

const markerSchema = z.enum(['read', 'write']);

const relaySchema = z.object({
  url: z.string().url(),
  marker: markerSchema.optional(),
});

type RelayEntity = z.infer<typeof relaySchema>;

export const adminRelaysController: AppController = async (c) => {
  const store = await Storages.db();

  const [event] = await store.query([
    { kinds: [10002], authors: [Conf.pubkey], limit: 1 },
  ]);

  if (!event) {
    return c.json([]);
  }

  return c.json(renderRelays(event));
};

export const adminSetRelaysController: AppController = async (c) => {
  const store = await Storages.db();
  const relays = relaySchema.array().parse(await c.req.json());

  const event = await new AdminSigner().signEvent({
    kind: 10002,
    tags: relays.map(({ url, marker }) => marker ? ['r', url, marker] : ['r', url]),
    content: '',
    created_at: Math.floor(Date.now() / 1000),
  });

  await store.event(event);

  return c.json(renderRelays(event));
};

/** Render Ditto API relays from a NIP-65 event. */
function renderRelays(event: NostrEvent): RelayEntity[] {
  return event.tags.reduce((acc, [name, url, marker]) => {
    if (name === 'r') {
      const relay: RelayEntity = {
        url,
        marker: markerSchema.safeParse(marker).success ? marker as 'read' | 'write' : undefined,
      };
      acc.push(relay);
    }
    return acc;
  }, [] as RelayEntity[]);
}

const nameRequestSchema = z.object({
  name: z.string().email(),
  reason: z.string().max(500).optional(),
});

export const nameRequestController: AppController = async (c) => {
  const store = await Storages.db();
  const signer = c.get('signer')!;
  const pubkey = await signer.getPublicKey();

  const { name, reason } = nameRequestSchema.parse(await c.req.json());

  const [existing] = await store.query([{ kinds: [3036], authors: [pubkey], '#r': [name], limit: 1 }]);
  if (existing) {
    return c.json({ error: 'Name request already exists' }, 400);
  }

  const event = await createEvent({
    kind: 3036,
    content: reason,
    tags: [
      ['r', name],
      ['L', 'nip05.domain'],
      ['l', name.split('@')[1], 'nip05.domain'],
      ['p', Conf.pubkey],
    ],
  }, c);

  await hydrateEvents({ events: [event], store: await Storages.db() });

  const nameRequest = await renderNameRequest(event);
  return c.json(nameRequest);
};

const nameRequestsSchema = z.object({
  approved: booleanParamSchema.optional(),
  rejected: booleanParamSchema.optional(),
});

export const nameRequestsController: AppController = async (c) => {
  const store = await Storages.db();
  const signer = c.get('signer')!;
  const pubkey = await signer.getPublicKey();

  const params = c.get('pagination');
  const { approved, rejected } = nameRequestsSchema.parse(c.req.query());

  const filter: NostrFilter = {
    kinds: [30383],
    authors: [Conf.pubkey],
    '#k': ['3036'],
    '#p': [pubkey],
    ...params,
  };

  if (approved) {
    filter['#n'] = ['approved'];
  }
  if (rejected) {
    filter['#n'] = ['rejected'];
  }

  const orig = await store.query([filter]);
  const ids = new Set<string>();

  for (const event of orig) {
    const d = event.tags.find(([name]) => name === 'd')?.[1];
    if (d) {
      ids.add(d);
    }
  }

  if (!ids.size) {
    return c.json([]);
  }

  const events = await store.query([{ kinds: [3036], ids: [...ids], authors: [pubkey] }])
    .then((events) => hydrateEvents({ store, events: events, signal: c.req.raw.signal }));

  const nameRequests = await Promise.all(
    events.map((event) => renderNameRequest(event)),
  );

  return paginated(c, orig, nameRequests);
};

const zapSplitSchema = z.record(
  n.id(),
  z.object({
    weight: z.number().int().min(1).max(100),
    message: z.string().max(500),
  }),
);

export const updateZapSplitsController: AppController = async (c) => {
  const body = await parseBody(c.req.raw);
  const result = zapSplitSchema.safeParse(body);
  const store = c.get('store');

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  const dittoZapSplit = await getZapSplits(store, Conf.pubkey);
  if (!dittoZapSplit) {
    return c.json({ error: 'Zap split not activated, restart the server.' }, 404);
  }

  const { data } = result;
  const pubkeys = Object.keys(data);

  if (pubkeys.length < 1) {
    return c.json(200);
  }

  await updateListAdminEvent(
    { kinds: [30078], authors: [Conf.pubkey], '#d': ['pub.ditto.zapSplits'], limit: 1 },
    (tags) =>
      pubkeys.reduce((accumulator, pubkey) => {
        return addTag(accumulator, ['p', pubkey, data[pubkey].weight.toString(), data[pubkey].message]);
      }, tags),
    c,
  );

  return c.json(200);
};

const deleteZapSplitSchema = z.array(n.id()).min(1);

export const deleteZapSplitsController: AppController = async (c) => {
  const body = await parseBody(c.req.raw);
  const result = deleteZapSplitSchema.safeParse(body);
  const store = c.get('store');

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  const dittoZapSplit = await getZapSplits(store, Conf.pubkey);
  if (!dittoZapSplit) {
    return c.json({ error: 'Zap split not activated, restart the server.' }, 404);
  }

  const { data } = result;

  await updateListAdminEvent(
    { kinds: [30078], authors: [Conf.pubkey], '#d': ['pub.ditto.zapSplits'], limit: 1 },
    (tags) =>
      data.reduce((accumulator, currentValue) => {
        return deleteTag(accumulator, ['p', currentValue]);
      }, tags),
    c,
  );

  return c.json(200);
};

export const getZapSplitsController: AppController = async (c) => {
  const store = c.get('store');

  const dittoZapSplit: DittoZapSplits | undefined = await getZapSplits(store, Conf.pubkey) ?? {};
  if (!dittoZapSplit) {
    return c.json({ error: 'Zap split not activated, restart the server.' }, 404);
  }

  const pubkeys = Object.keys(dittoZapSplit);

  const zapSplits = await Promise.all(pubkeys.map(async (pubkey) => {
    const author = await getAuthor(pubkey);

    const account = author ? await renderAccount(author) : await accountFromPubkey(pubkey);

    return {
      account,
      weight: dittoZapSplit[pubkey].weight,
      message: dittoZapSplit[pubkey].message,
    };
  }));

  return c.json(zapSplits, 200);
};

export const statusZapSplitsController: AppController = async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const { signal } = c.req.raw;

  const [event] = await store.query([{ kinds: [1], ids: [id], limit: 1 }], { signal });
  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const zapsTag = event.tags.filter(([name]) => name === 'zap');

  const pubkeys = zapsTag.map((name) => name[1]);

  const users = await store.query([{ authors: pubkeys, kinds: [0], limit: pubkeys.length }], { signal });
  await hydrateEvents({ events: users, store, signal });

  const zapSplits = (await Promise.all(pubkeys.map(async (pubkey) => {
    const author = (users.find((event) => event.pubkey === pubkey) as DittoEvent | undefined)?.author;
    const account = author ? await renderAccount(author) : await accountFromPubkey(pubkey);

    const weight = percentageSchema.catch(0).parse(zapsTag.find((name) => name[1] === pubkey)![3]) ?? 0;

    const message = zapsTag.find((name) => name[1] === pubkey)![4] ?? '';

    return {
      account,
      message,
      weight,
    };
  }))).filter((zapSplit) => zapSplit.weight > 0);

  return c.json(zapSplits, 200);
};

const updateInstanceSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  /** Mastodon doesn't have this field. */
  screenshot_ids: z.string().array().nullish(),
  /** Mastodon doesn't have this field. */
  thumbnail_id: z.string().optional(),
}).strict();

export const updateInstanceController: AppController = async (c) => {
  const body = await parseBody(c.req.raw);
  const result = updateInstanceSchema.safeParse(body);
  const pubkey = Conf.pubkey;

  if (!result.success) {
    return c.json(result.error, 422);
  }

  await updateEvent(
    { kinds: [0], authors: [pubkey], limit: 1 },
    async (_) => {
      const meta = await getInstanceMetadata(await Storages.db(), c.req.raw.signal);
      const {
        title,
        description,
        screenshot_ids,
        thumbnail_id,
      } = result.data;

      const thumbnailUrl: string | undefined = (() => {
        if (!thumbnail_id) {
          return undefined;
        }

        const upload = dittoUploads.get(thumbnail_id);

        if (!upload) {
          throw new HTTPException(422, { message: 'Uploaded attachment is no longer available.' });
        }
        return upload.url;
      })();

      const screenshots: z.infer<typeof screenshotsSchema> = (screenshot_ids ?? []).map((id) => {
        const upload = dittoUploads.get(id);

        if (!upload) {
          throw new HTTPException(422, { message: 'Uploaded attachment is no longer available.' });
        }

        const data = renderAttachment(upload);

        if (!data?.url || !data.meta?.original) {
          throw new HTTPException(422, { message: 'Image must have an URL and size dimensions.' });
        }

        const screenshot = {
          src: data.url,
          label: data.description,
          sizes: `${data?.meta?.original?.width}x${data?.meta?.original?.height}`,
          type: data?.type, // FIX-ME, I BEG YOU: Returns just `image` instead of a valid MIME type
        };

        return screenshot;
      });

      meta.name = title ?? meta.name;
      meta.about = description ?? meta.about;
      meta.screenshots = screenshot_ids ? screenshots : meta.screenshots;
      meta.picture = thumbnailUrl ?? meta.picture;

      return {
        kind: 0,
        content: JSON.stringify(meta),
        tags: [],
      };
    },
    c,
  );

  return c.json(204);
};
