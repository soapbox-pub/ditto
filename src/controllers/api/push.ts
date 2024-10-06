import { nip19 } from 'nostr-tools';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { Storages } from '@/storages.ts';
import { parseBody } from '@/utils/api.ts';
import { getTokenHash } from '@/utils/auth.ts';

const pushSubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
  }),
  data: z.object({
    alerts: z.object({
      mention: z.boolean().optional(),
      status: z.boolean().optional(),
      reblog: z.boolean().optional(),
      follow: z.boolean().optional(),
      follow_request: z.boolean().optional(),
      favourite: z.boolean().optional(),
      poll: z.boolean().optional(),
      update: z.boolean().optional(),
      'admin.sign_up': z.boolean().optional(),
      'admin.report': z.boolean().optional(),
    }).optional(),
    policy: z.enum(['all', 'followed', 'follower', 'none']).optional(),
  }).optional(),
});

export const pushSubscribeController: AppController = async (c) => {
  const BEARER_REGEX = new RegExp(`^Bearer (${nip19.BECH32_REGEX.source})$`);

  const header = c.req.header('authorization');
  const match = header?.match(BEARER_REGEX);

  if (!match) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const [_, bech32] = match;

  if (!bech32.startsWith('token1')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const kysely = await Storages.kysely();
  const signer = c.get('signer')!;

  const result = pushSubscribeSchema.safeParse(await parseBody(c.req.raw));

  if (!result.success) {
    return c.json({ error: 'Invalid request', schema: result.error }, 400);
  }

  const { subscription, data } = result.data;

  const { id } = await kysely
    .insertInto('push_subscriptions')
    .values({
      pubkey: await signer.getPublicKey(),
      token_hash: await getTokenHash(bech32 as `token1${string}`),
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      data,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return c.json({
    id,
    endpoint: subscription.endpoint,
    alerts: data?.alerts ?? {},
    policy: data?.policy ?? 'all',
    // TODO: server_key
  });
};
