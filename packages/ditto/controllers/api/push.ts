import { HTTPException } from '@hono/hono/http-exception';
import { nip19 } from 'nostr-tools';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { parseBody } from '@/utils/api.ts';
import { getTokenHash } from '@/utils/auth.ts';

/** https://docs.joinmastodon.org/entities/WebPushSubscription/ */
interface MastodonPushSubscription {
  id: string;
  endpoint: string;
  server_key: string;
  alerts: Record<string, boolean>;
  policy: 'all' | 'followed' | 'follower' | 'none';
}

const pushSubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
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
  const { conf, db, user } = c.var;
  const vapidPublicKey = await conf.vapidPublicKey;

  if (!vapidPublicKey) {
    return c.json({ error: 'The administrator of this server has not enabled Web Push notifications.' }, 404);
  }

  const accessToken = getAccessToken(c.req.raw);
  const signer = user!.signer;

  const result = pushSubscribeSchema.safeParse(await parseBody(c.req.raw));

  if (!result.success) {
    return c.json({ error: 'Invalid request', schema: result.error }, 400);
  }

  const { subscription, data } = result.data;

  const pubkey = await signer.getPublicKey();
  const tokenHash = await getTokenHash(accessToken);

  const { id } = await db.kysely.transaction().execute(async (trx) => {
    await trx
      .deleteFrom('push_subscriptions')
      .where('token_hash', '=', tokenHash)
      .execute();

    return trx
      .insertInto('push_subscriptions')
      .values({
        pubkey,
        token_hash: tokenHash,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        data,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
  });

  return c.json(
    {
      id: id.toString(),
      endpoint: subscription.endpoint,
      alerts: data?.alerts ?? {},
      policy: data?.policy ?? 'all',
      server_key: vapidPublicKey,
    } satisfies MastodonPushSubscription,
  );
};

export const getSubscriptionController: AppController = async (c) => {
  const { conf, db } = c.var;
  const vapidPublicKey = await conf.vapidPublicKey;

  if (!vapidPublicKey) {
    return c.json({ error: 'The administrator of this server has not enabled Web Push notifications.' }, 404);
  }

  const accessToken = getAccessToken(c.req.raw);

  const tokenHash = await getTokenHash(accessToken);

  const row = await db.kysely
    .selectFrom('push_subscriptions')
    .selectAll()
    .where('token_hash', '=', tokenHash)
    .executeTakeFirst();

  if (!row) {
    return c.json({ error: 'Record not found' }, 404);
  }

  return c.json(
    {
      id: row.id.toString(),
      endpoint: row.endpoint,
      alerts: row.data?.alerts ?? {},
      policy: row.data?.policy ?? 'all',
      server_key: vapidPublicKey,
    } satisfies MastodonPushSubscription,
  );
};

/**
 * Get access token from HTTP headers, but only if it's a `token1`.
 * Otherwise throw an `HTTPException` with a 401.
 */
function getAccessToken(request: Request): `token1${string}` {
  const BEARER_REGEX = new RegExp(`^Bearer (${nip19.BECH32_REGEX.source})$`);

  const authorization = request.headers.get('authorization');
  const match = authorization?.match(BEARER_REGEX);

  const [_, accessToken] = match ?? [];

  if (accessToken?.startsWith('token1')) {
    return accessToken as `token1${string}`;
  }

  throw new HTTPException(401, { message: 'The access token is invalid' });
}
