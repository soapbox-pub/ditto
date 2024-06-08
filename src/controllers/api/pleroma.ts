import { NSchema as n, NStore } from '@nostrify/nostrify';
import { z } from 'zod';

import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { configSchema, elixirTupleSchema, type PleromaConfig } from '@/schemas/pleroma-api.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { Storages } from '@/storages.ts';
import { createAdminEvent, updateAdminEvent, updateUser } from '@/utils/api.ts';
import { lookupPubkey } from '@/utils/lookup.ts';

const frontendConfigController: AppController = async (c) => {
  const store = await Storages.db();
  const configs = await getConfigs(store, c.req.raw.signal);
  const frontendConfig = configs.find(({ group, key }) => group === ':pleroma' && key === ':frontend_configurations');

  if (frontendConfig) {
    const schema = elixirTupleSchema.transform(({ tuple }) => tuple).array();
    const data = schema.parse(frontendConfig.value).reduce<Record<string, unknown>>((result, [name, data]) => {
      result[name.replace(/^:/, '')] = data;
      return result;
    }, {});
    return c.json(data);
  } else {
    return c.json({});
  }
};

const configController: AppController = async (c) => {
  const store = await Storages.db();
  const configs = await getConfigs(store, c.req.raw.signal);
  return c.json({ configs, need_reboot: false });
};

/** Pleroma admin config controller. */
const updateConfigController: AppController = async (c) => {
  const { pubkey } = Conf;

  const store = await Storages.db();
  const configs = await getConfigs(store, c.req.raw.signal);
  const { configs: newConfigs } = z.object({ configs: z.array(configSchema) }).parse(await c.req.json());

  for (const { group, key, value } of newConfigs) {
    const index = configs.findIndex((c) => c.group === group && c.key === key);
    if (index === -1) {
      configs.push({ group, key, value });
    } else {
      configs[index].value = value;
    }
  }

  await createAdminEvent({
    kind: 30078,
    content: await new AdminSigner().nip44.encrypt(pubkey, JSON.stringify(configs)),
    tags: [
      ['d', 'pub.ditto.pleroma.config'],
      ['encrypted', 'nip44'],
    ],
  }, c);

  return c.json({ configs: newConfigs, need_reboot: false });
};

const pleromaAdminDeleteStatusController: AppController = async (c) => {
  await createAdminEvent({
    kind: 5,
    tags: [['e', c.req.param('id')]],
  }, c);

  return c.json({});
};

async function getConfigs(store: NStore, signal: AbortSignal): Promise<PleromaConfig[]> {
  const { pubkey } = Conf;

  const [event] = await store.query([{
    kinds: [30078],
    authors: [pubkey],
    '#d': ['pub.ditto.pleroma.config'],
    limit: 1,
  }], { signal });

  try {
    const decrypted = await new AdminSigner().nip44.decrypt(Conf.pubkey, event.content);
    return n.json().pipe(configSchema.array()).catch([]).parse(decrypted);
  } catch (_e) {
    return [];
  }
}

const pleromaAdminTagSchema = z.object({
  nicknames: z.string().array(),
  tags: z.string().array(),
});

const pleromaAdminTagController: AppController = async (c) => {
  const params = pleromaAdminTagSchema.parse(await c.req.json());

  for (const nickname of params.nicknames) {
    const pubkey = await lookupPubkey(nickname);
    if (!pubkey) continue;

    await updateAdminEvent(
      { kinds: [30382], authors: [Conf.pubkey], '#d': [pubkey], limit: 1 },
      (prev) => {
        const tags = prev?.tags ?? [['d', pubkey]];

        for (const tag of params.tags) {
          const existing = prev?.tags.some(([name, value]) => name === 't' && value === tag);
          if (!existing) {
            tags.push(['t', tag]);
          }
        }

        return {
          kind: 30382,
          content: prev?.content ?? '',
          tags,
        };
      },
      c,
    );
  }

  return new Response(null, { status: 204 });
};

const pleromaAdminUntagController: AppController = async (c) => {
  const params = pleromaAdminTagSchema.parse(await c.req.json());

  for (const nickname of params.nicknames) {
    const pubkey = await lookupPubkey(nickname);
    if (!pubkey) continue;

    await updateAdminEvent(
      { kinds: [30382], authors: [Conf.pubkey], '#d': [pubkey], limit: 1 },
      (prev) => ({
        kind: 30382,
        content: prev?.content ?? '',
        tags: (prev?.tags ?? [['d', pubkey]])
          .filter(([name, value]) => !(name === 't' && params.tags.includes(value))),
      }),
      c,
    );
  }

  return new Response(null, { status: 204 });
};

const pleromaAdminSuggestSchema = z.object({
  nicknames: z.string().array(),
});

const pleromaAdminSuggestController: AppController = async (c) => {
  const { nicknames } = pleromaAdminSuggestSchema.parse(await c.req.json());

  for (const nickname of nicknames) {
    const pubkey = await lookupPubkey(nickname);
    if (!pubkey) continue;
    await updateUser(pubkey, { suggest: true }, c);
  }

  return new Response(null, { status: 204 });
};

const pleromaAdminUnsuggestController: AppController = async (c) => {
  const { nicknames } = pleromaAdminSuggestSchema.parse(await c.req.json());

  for (const nickname of nicknames) {
    const pubkey = await lookupPubkey(nickname);
    if (!pubkey) continue;
    await updateUser(pubkey, { suggest: false }, c);
  }

  return new Response(null, { status: 204 });
};

export {
  configController,
  frontendConfigController,
  pleromaAdminDeleteStatusController,
  pleromaAdminSuggestController,
  pleromaAdminTagController,
  pleromaAdminUnsuggestController,
  pleromaAdminUntagController,
  updateConfigController,
};
