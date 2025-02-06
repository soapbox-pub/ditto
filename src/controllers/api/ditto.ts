import { CashuMint, CashuWallet, getEncodedToken, type Proof } from '@cashu/cashu-ts';
import { NostrEvent, NostrFilter, NSchema as n } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToString, stringToBytes } from '@scure/base';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { getAuthor } from '@/queries.ts';
import { isNostrId } from '@/utils.ts';
import { addTag } from '@/utils/tags.ts';
import { createEvent, paginated, parseBody, updateAdminEvent } from '@/utils/api.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';
import { deleteTag } from '@/utils/tags.ts';
import { DittoZapSplits, getZapSplits } from '@/utils/zap-split.ts';
import { errorJson } from '@/utils/log.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { screenshotsSchema } from '@/schemas/nostr.ts';
import { booleanParamSchema, percentageSchema, wsUrlSchema } from '@/schema.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { renderNameRequest } from '@/views/ditto.ts';
import { accountFromPubkey } from '@/views/mastodon/accounts.ts';
import { renderAccount } from '@/views/mastodon/accounts.ts';
import { Storages } from '@/storages.ts';
import { updateListAdminEvent } from '@/utils/api.ts';

const markerSchema = z.enum(['read', 'write']);

const relaySchema = z.object({
  url: wsUrlSchema,
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

  const [event] = await store.query([{ kinds: [1, 20], ids: [id], limit: 1 }], { signal });
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
  const body = await parseBody(c.req.raw);
  const result = updateInstanceSchema.safeParse(body);
  const pubkey = Conf.pubkey;

  if (!result.success) {
    return c.json(result.error, 422);
  }

  const meta = await getInstanceMetadata(await Storages.db(), c.req.raw.signal);

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

  return c.json(204);
};

const createCashuWalletSchema = z.object({
  mints: z.array(z.string().url()).nonempty(), // must contain at least one item
});

/**
 * Creates a replaceable Cashu wallet.
 * https://github.com/nostr-protocol/nips/blob/master/60.md
 */
export const createCashuWalletController: AppController = async (c) => {
  const signer = c.get('signer')!;
  const store = c.get('store');
  const pubkey = await signer.getPublicKey();
  const body = await parseBody(c.req.raw);
  const { signal } = c.req.raw;
  const result = createCashuWalletSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'Bad schema', schema: result.error }, 400);
  }

  const nip44 = signer.nip44;
  if (!nip44) {
    return c.json({ error: 'Signer does not have nip 44' }, 400);
  }

  const [event] = await store.query([{ authors: [pubkey], kinds: [17375] }], { signal });
  if (event) {
    return c.json({ error: 'You already have a wallet 😏' }, 400);
  }

  const contentTags: string[][] = [];

  const sk = generateSecretKey();
  const privkey = bytesToString('hex', sk);

  contentTags.push(['privkey', privkey]);

  const { mints } = result.data;

  for (const mint of new Set(mints)) {
    contentTags.push(['mint', mint]);
  }

  const encryptedContentTags = await nip44.encrypt(pubkey, JSON.stringify(contentTags));

  // Wallet
  await createEvent({
    kind: 17375,
    content: encryptedContentTags,
  }, c);

  return c.json(201);
};

const createNutzapInformationSchema = z.object({
  relays: z.array(z.string().url()),
  mints: z.array(z.string().url()).nonempty(), // must contain at least one item
});

/**
 * Creates a replaceable Nutzap information for a specific wallet.
 * https://github.com/nostr-protocol/nips/blob/master/61.md#nutzap-informational-event
 */
export const createNutzapInformationController: AppController = async (c) => {
  const signer = c.get('signer')!;
  const store = c.get('store');
  const pubkey = await signer.getPublicKey();
  const body = await parseBody(c.req.raw);
  const { signal } = c.req.raw;
  const result = createNutzapInformationSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'Bad schema', schema: result.error }, 400);
  }

  const nip44 = signer.nip44;
  if (!nip44) {
    return c.json({ error: 'Signer does not have nip 44' }, 400);
  }

  const { relays, mints } = result.data;

  const [event] = await store.query([{ authors: [pubkey], kinds: [17375] }], { signal });
  if (!event) {
    return c.json({ error: 'You need to have a wallet to create a nutzap information event.' }, 400);
  }

  relays.push(Conf.relay);

  const tags: string[][] = [];

  for (const mint of new Set(mints)) {
    tags.push(['mint', mint, 'sat']);
  }

  for (const relay of new Set(relays)) {
    tags.push(['relay', relay]);
  }

  let decryptedContent: string;
  try {
    decryptedContent = await nip44.decrypt(pubkey, event.content);
  } catch (e) {
    logi({ level: 'error', ns: 'ditto.api', id: event.id, kind: event.kind, error: errorJson(e) });
    return c.json({ error: 'Could not decrypt wallet content.' }, 400);
  }

  let contentTags: string[][];
  try {
    contentTags = JSON.parse(decryptedContent);
  } catch {
    return c.json({ error: 'Could not JSON parse the decrypted wallet content.' }, 400);
  }

  const privkey = contentTags.find(([value]) => value === 'privkey')?.[1];
  if (!privkey || !isNostrId(privkey)) {
    return c.json({ error: 'Wallet does not contain privkey or privkey is not a valid nostr id.' }, 400);
  }

  const p2pk = getPublicKey(stringToBytes('hex', privkey));

  tags.push(['pubkey', p2pk]);

  // Nutzap information
  await createEvent({
    kind: 10019,
    tags,
  }, c);

  return c.json(201);
};

/**
 * Swaps all nutzaps (NIP-61) to the user's wallet (NIP-60)
 */
export const swapNutzapsToWalletController: AppController = async (c) => {
  const signer = c.get('signer')!;
  const store = c.get('store');
  const pubkey = await signer.getPublicKey();
  const { signal } = c.req.raw;

  const nip44 = signer.nip44;
  if (!nip44) {
    return c.json({ error: 'Signer does not have nip 44.' }, 400);
  }

  const [wallet] = await store.query([{ authors: [pubkey], kinds: [17375] }], { signal });
  if (!wallet) {
    return c.json({ error: 'You need to have a wallet to swap the nutzaps into it.' }, 400);
  }

  let decryptedContent: string;
  try {
    decryptedContent = await nip44.decrypt(pubkey, wallet.content);
  } catch (e) {
    logi({ level: 'error', ns: 'ditto.api', id: wallet.id, kind: wallet.kind, error: errorJson(e) });
    return c.json({ error: 'Could not decrypt wallet content.' }, 400);
  }

  let contentTags: string[][];
  try {
    contentTags = JSON.parse(decryptedContent);
  } catch {
    return c.json({ error: 'Could not JSON parse the decrypted wallet content.' }, 400);
  }

  const privkey = contentTags.find(([value]) => value === 'privkey')?.[1];
  if (!privkey || !isNostrId(privkey)) {
    return c.json({ error: 'Wallet does not contain privkey or privkey is not a valid nostr id.' }, 400);
  }
  const p2pk = getPublicKey(stringToBytes('hex', privkey));

  const [nutzapInformation] = await store.query([{ authors: [pubkey], kinds: [10019] }], { signal });
  if (!nutzapInformation) {
    return c.json({ error: 'You need to have a nutzap information event so we can get the mints.' }, 400);
  }

  const nutzapInformationPubkey = nutzapInformation.tags.find(([name]) => name === 'pubkey')?.[1];
  if (!nutzapInformationPubkey || (nutzapInformationPubkey !== p2pk)) {
    return c.json({
      error:
        "You do not have a 'pubkey' tag in your nutzap information event or the one you have does not match the one derivated from the wallet.",
    }, 400);
  }

  const mints = [...new Set(nutzapInformation.tags.filter(([name]) => name === 'mint').map(([_, value]) => value))];
  if (mints.length < 1) {
    return c.json({ error: 'You do not have any mints in your nutzap information event.' }, 400);
  }

  const nutzapsFilter: NostrFilter = { kinds: [9321], '#p': [pubkey], '#u': mints };

  const [nutzapHistory] = await store.query([{ kinds: [7376], authors: [pubkey] }], { signal });
  if (nutzapHistory) {
    nutzapsFilter.since = nutzapHistory.created_at;
  }

  const nutzaps = await store.query([nutzapsFilter], { signal });

  const mintsToProofs: { [key: string]: Proof[] } = {};
  nutzaps.forEach(async (event) => {
    try {
      const { mint, proofs }: { mint: string; proofs: Proof[] } = JSON.parse( // TODO: create a merge request in nostr tools or Nostrify to do this in a nice way?
        await nip44.decrypt(pubkey, event.content),
      );
      if (typeof mint === 'string') {
        mintsToProofs[mint] = [...(mintsToProofs[mint] || []), ...proofs];
      }
    } catch {
      // do nothing, for now... (maybe print errors)
    }
  });

  for (const mint of Object.keys(mintsToProofs)) {
    const token = getEncodedToken({ mint, proofs: mintsToProofs[mint] }, { version: 3 });

    const cashuWallet = new CashuWallet(new CashuMint(mint));
    const receiveProofs = await cashuWallet.receive(token);

    await createEvent({
      kind: 7375,
      content: await nip44.encrypt(
        pubkey,
        JSON.stringify({
          mint,
          proofs: receiveProofs,
        }),
      ),
    }, c);

    // TODO: create the 7376 history kind, reemded marker, etc
  }

  return c.json(201);
};
