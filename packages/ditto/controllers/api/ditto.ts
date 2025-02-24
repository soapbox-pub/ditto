import { paginated } from '@ditto/mastoapi/pagination';
import { NostrEvent, NostrFilter, NSchema as n } from '@nostrify/nostrify';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { getAuthor } from '@/queries.ts';
import { addTag } from '@/utils/tags.ts';
import { createEvent, parseBody, updateAdminEvent } from '@/utils/api.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';
import { deleteTag } from '@/utils/tags.ts';
import { DittoZapSplits, getZapSplits } from '@/utils/zap-split.ts';
import { screenshotsSchema } from '@/schemas/nostr.ts';
import { booleanParamSchema, percentageSchema } from '@/schema.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { renderNameRequest } from '@/views/ditto.ts';
import { accountFromPubkey } from '@/views/mastodon/accounts.ts';
import { renderAccount } from '@/views/mastodon/accounts.ts';
import { updateListAdminEvent } from '@/utils/api.ts';

const markerSchema = z.enum(['read', 'write']);

/** WebSocket URL. */
const wsUrlSchema = z.string().refine((val): val is `wss://${string}` | `ws://${string}` => {
  try {
    const { protocol } = new URL(val);
    return protocol === 'wss:' || protocol === 'ws:';
  } catch {
    return false;
  }
}, 'Invalid WebSocket URL');

const relaySchema = z.object({
  url: wsUrlSchema,
  marker: markerSchema.optional(),
});

type RelayEntity = z.infer<typeof relaySchema>;

export const adminRelaysController: AppController = async (c) => {
  const { conf, relay } = c.var;

  const [event] = await relay.query([
    { kinds: [10002], authors: [await conf.signer.getPublicKey()], limit: 1 },
  ]);

  if (!event) {
    return c.json([]);
  }

  return c.json(renderRelays(event));
};

export const adminSetRelaysController: AppController = async (c) => {
  const { conf, relay } = c.var;
  const relays = relaySchema.array().parse(await c.req.json());

  const event = await conf.signer.signEvent({
    kind: 10002,
    tags: relays.map(({ url, marker }) => marker ? ['r', url, marker] : ['r', url]),
    content: '',
    created_at: Math.floor(Date.now() / 1000),
  });

  await relay.event(event);

  return c.json(renderRelays(event));
};

/** Render Ditto API relays from a NIP-65 event. */
function renderRelays(event: NostrEvent): RelayEntity[] {
  return event.tags.reduce((acc, [name, url, marker]) => {
    if (name === 'r') {
      const relay: RelayEntity = {
        url: url as `wss://${string}`,
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
  const { conf, relay, user } = c.var;

  const pubkey = await user!.signer.getPublicKey();
  const result = nameRequestSchema.safeParse(await c.req.json());

  if (!result.success) {
    return c.json({ error: 'Invalid username', schema: result.error }, 400);
  }

  const { name, reason } = result.data;

  const [existing] = await relay.query([{ kinds: [3036], authors: [pubkey], '#r': [name.toLowerCase()], limit: 1 }]);
  if (existing) {
    return c.json({ error: 'Name request already exists' }, 400);
  }

  const r: string[][] = [['r', name]];

  if (name !== name.toLowerCase()) {
    r.push(['r', name.toLowerCase()]);
  }

  const event = await createEvent({
    kind: 3036,
    content: reason,
    tags: [
      ...r,
      ['L', 'nip05.domain'],
      ['l', name.split('@')[1], 'nip05.domain'],
      ['p', await conf.signer.getPublicKey()],
    ],
  }, c);

  await hydrateEvents({ ...c.var, events: [event] });

  const nameRequest = await renderNameRequest(event);
  return c.json(nameRequest);
};

const nameRequestsSchema = z.object({
  approved: booleanParamSchema.optional(),
  rejected: booleanParamSchema.optional(),
});

export const nameRequestsController: AppController = async (c) => {
  const { conf, relay, user } = c.var;
  const pubkey = await user!.signer.getPublicKey();

  const params = c.get('pagination');
  const { approved, rejected } = nameRequestsSchema.parse(c.req.query());

  const filter: NostrFilter = {
    kinds: [30383],
    authors: [await conf.signer.getPublicKey()],
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

  const orig = await relay.query([filter]);
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

  const events = await relay.query([{ kinds: [3036], ids: [...ids], authors: [pubkey] }])
    .then((events) => hydrateEvents({ ...c.var, events }));

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
  const { conf, relay } = c.var;
  const body = await parseBody(c.req.raw);
  const result = zapSplitSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  const adminPubkey = await conf.signer.getPublicKey();

  const dittoZapSplit = await getZapSplits(relay, adminPubkey);
  if (!dittoZapSplit) {
    return c.json({ error: 'Zap split not activated, restart the server.' }, 404);
  }

  const { data } = result;
  const pubkeys = Object.keys(data);

  if (pubkeys.length < 1) {
    return c.newResponse(null, { status: 204 });
  }

  await updateListAdminEvent(
    { kinds: [30078], authors: [adminPubkey], '#d': ['pub.ditto.zapSplits'], limit: 1 },
    (tags) =>
      pubkeys.reduce((accumulator, pubkey) => {
        return addTag(accumulator, ['p', pubkey, data[pubkey].weight.toString(), data[pubkey].message]);
      }, tags),
    c,
  );

  return c.newResponse(null, { status: 204 });
};

const deleteZapSplitSchema = z.array(n.id()).min(1);

export const deleteZapSplitsController: AppController = async (c) => {
  const { conf, relay } = c.var;
  const body = await parseBody(c.req.raw);
  const result = deleteZapSplitSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  const adminPubkey = await conf.signer.getPublicKey();

  const dittoZapSplit = await getZapSplits(relay, adminPubkey);
  if (!dittoZapSplit) {
    return c.json({ error: 'Zap split not activated, restart the server.' }, 404);
  }

  const { data } = result;

  await updateListAdminEvent(
    { kinds: [30078], authors: [adminPubkey], '#d': ['pub.ditto.zapSplits'], limit: 1 },
    (tags) =>
      data.reduce((accumulator, currentValue) => {
        return deleteTag(accumulator, ['p', currentValue]);
      }, tags),
    c,
  );

  return c.newResponse(null, { status: 204 });
};

export const getZapSplitsController: AppController = async (c) => {
  const { conf, relay } = c.var;

  const dittoZapSplit: DittoZapSplits | undefined = await getZapSplits(relay, await conf.signer.getPublicKey()) ?? {};
  if (!dittoZapSplit) {
    return c.json({ error: 'Zap split not activated, restart the server.' }, 404);
  }

  const pubkeys = Object.keys(dittoZapSplit);

  const zapSplits = await Promise.all(pubkeys.map(async (pubkey) => {
    const author = await getAuthor(pubkey, c.var);

    const account = author ? renderAccount(author) : accountFromPubkey(pubkey);

    return {
      account,
      weight: dittoZapSplit[pubkey].weight,
      message: dittoZapSplit[pubkey].message,
    };
  }));

  return c.json(zapSplits, 200);
};

export const statusZapSplitsController: AppController = async (c) => {
  const { relay, signal } = c.var;

  const id = c.req.param('id');

  const [event] = await relay.query([{ kinds: [1, 20], ids: [id], limit: 1 }], { signal });
  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const zapsTag = event.tags.filter(([name]) => name === 'zap');

  const pubkeys = zapsTag.map((name) => name[1]);

  const users = await relay.query([{ authors: pubkeys, kinds: [0], limit: pubkeys.length }], { signal });
  await hydrateEvents({ ...c.var, events: users });

  const zapSplits = (await Promise.all(pubkeys.map((pubkey) => {
    const author = (users.find((event) => event.pubkey === pubkey) as DittoEvent | undefined)?.author;
    const account = author ? renderAccount(author) : accountFromPubkey(pubkey);

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
  title: z.string(),
  description: z.string(),
  short_description: z.string(),
  /** Mastodon doesn't have this field. */
  screenshots: screenshotsSchema,
  /** https://docs.joinmastodon.org/entities/Instance/#thumbnail-url */
  thumbnail: z.object({
    url: z.string().url(),
  }),
});

export const updateInstanceController: AppController = async (c) => {
  const { conf, relay, signal } = c.var;

  const body = await parseBody(c.req.raw);
  const result = updateInstanceSchema.safeParse(body);
  const pubkey = await conf.signer.getPublicKey();

  if (!result.success) {
    return c.json(result.error, 422);
  }

  const meta = await getInstanceMetadata(relay, signal);

  await updateAdminEvent(
    { kinds: [0], authors: [pubkey], limit: 1 },
    (_) => {
      const {
        title,
        description,
        short_description,
        screenshots,
        thumbnail,
      } = result.data;

      meta.name = title;
      meta.about = description;
      meta.tagline = short_description;
      meta.screenshots = screenshots;
      meta.picture = thumbnail.url;
      delete meta.event;

      return {
        kind: 0,
        content: JSON.stringify(meta),
        tags: [],
      };
    },
    c,
  );

  return c.newResponse(null, { status: 204 });
};
