import { nip19 } from 'nostr-tools';
import { z } from 'zod';

import { type AppController } from '@/app.ts';
import { createAdminEvent, parseBody, updateAdminEvent, updateUser } from '@/utils/api.ts';
import { nostrNow } from '@/utils.ts';
import { lookupPubkey } from '@/utils/lookup.ts';
import { getPleromaConfigs } from '@/utils/pleroma.ts';
import { renderAccount } from '@/views/mastodon/accounts.ts';
import { configSchema, elixirTupleSchema } from '@/schemas/pleroma-api.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';

const frontendConfigController: AppController = async (c) => {
  const configDB = await getPleromaConfigs(c.var);
  const frontendConfig = configDB.get(':pleroma', ':frontend_configurations');

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
  const configs = await getPleromaConfigs(c.var);
  return c.json({ configs, need_reboot: false });
};

/** Pleroma admin config controller. */
const updateConfigController: AppController = async (c) => {
  const { conf } = c.var;

  const configs = await getPleromaConfigs(c.var);
  const { configs: newConfigs } = z.object({ configs: z.array(configSchema) }).parse(await c.req.json());

  configs.merge(newConfigs);

  await createAdminEvent({
    kind: 30078,
    content: await conf.signer.nip44.encrypt(await conf.signer.getPublicKey(), JSON.stringify(configs)),
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

const pleromaAdminTagSchema = z.object({
  nicknames: z.string().array(),
  tags: z.string().array(),
});

const pleromaPromoteAdminSchema = z.object({
  nicknames: z.string().transform((value, ctx) => {
    try {
      const { type, data } = nip19.decode(value);
      if (type === 'npub') {
        return data;
      }

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Not a valid nip 19 npub',
      });

      return z.NEVER;
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Not a valid nip 19 npub',
      });

      return z.NEVER;
    }
  }).array().min(1),
});

const pleromaPromoteAdminController: AppController = async (c) => {
  const { conf, relay, signal } = c.var;
  const body = await parseBody(c.req.raw);
  const result = pleromaPromoteAdminSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 422);
  }

  const { data } = result;
  const { nicknames: authors } = data;

  const events = await relay.query([{ kinds: [0], authors }], { signal });

  if (events.length !== authors.length) {
    return c.json({ error: 'User profile is missing in the database' }, 422);
  }

  events.forEach(async (event) => {
    const [existing] = await relay.query([{
      kinds: [30382],
      authors: [await conf.signer.getPublicKey()],
      '#d': [event.pubkey],
      limit: 1,
    }]);

    const prevTags = (existing?.tags ?? []).filter(([name, value]) => {
      if (name === 'd') {
        return false;
      }
      if (name === 'n' && value === 'admin') {
        return false;
      }
      return true;
    });

    const tags: string[][] = [
      ['d', event.pubkey],
      ['n', 'admin'],
    ];

    tags.push(...prevTags);

    const promotion = await conf.signer.signEvent({
      kind: 30382,
      tags,
      content: '',
      created_at: nostrNow(),
    });

    await relay.event(promotion);
  });

  await hydrateEvents({ ...c.var, events });

  const accounts = events.map((event) => {
    return renderAccount(event);
  });

  return c.json(accounts, 200);
};

const pleromaAdminTagController: AppController = async (c) => {
  const { conf } = c.var;
  const params = pleromaAdminTagSchema.parse(await c.req.json());

  for (const nickname of params.nicknames) {
    const pubkey = await lookupPubkey(nickname, c.var);
    if (!pubkey) continue;

    await updateAdminEvent(
      { kinds: [30382], authors: [await conf.signer.getPublicKey()], '#d': [pubkey], limit: 1 },
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

  return c.newResponse(null, { status: 204 });
};

const pleromaAdminUntagController: AppController = async (c) => {
  const { conf } = c.var;
  const params = pleromaAdminTagSchema.parse(await c.req.json());

  for (const nickname of params.nicknames) {
    const pubkey = await lookupPubkey(nickname, c.var);
    if (!pubkey) continue;

    await updateAdminEvent(
      { kinds: [30382], authors: [await conf.signer.getPublicKey()], '#d': [pubkey], limit: 1 },
      (prev) => ({
        kind: 30382,
        content: prev?.content ?? '',
        tags: (prev?.tags ?? [['d', pubkey]])
          .filter(([name, value]) => !(name === 't' && params.tags.includes(value))),
      }),
      c,
    );
  }

  return c.newResponse(null, { status: 204 });
};

const pleromaAdminSuggestSchema = z.object({
  nicknames: z.string().array(),
});

const pleromaAdminSuggestController: AppController = async (c) => {
  const { nicknames } = pleromaAdminSuggestSchema.parse(await c.req.json());

  for (const nickname of nicknames) {
    const pubkey = await lookupPubkey(nickname, c.var);
    if (!pubkey) continue;
    await updateUser(pubkey, { suggested: true }, c);
  }

  return c.newResponse(null, { status: 204 });
};

const pleromaAdminUnsuggestController: AppController = async (c) => {
  const { nicknames } = pleromaAdminSuggestSchema.parse(await c.req.json());

  for (const nickname of nicknames) {
    const pubkey = await lookupPubkey(nickname, c.var);
    if (!pubkey) continue;
    await updateUser(pubkey, { suggested: false }, c);
  }

  return c.newResponse(null, { status: 204 });
};

export {
  configController,
  frontendConfigController,
  pleromaAdminDeleteStatusController,
  pleromaAdminSuggestController,
  pleromaAdminTagController,
  pleromaAdminUnsuggestController,
  pleromaAdminUntagController,
  pleromaPromoteAdminController,
  updateConfigController,
};
