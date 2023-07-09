import { Conf } from '@/config.ts';
import { db } from '@/db.ts';
import { nip19, z } from '@/deps.ts';
import { urlTransformSchema } from '@/schema.ts';

import type { AppController } from '@/app.ts';
import type { Webfinger } from '@/schemas/webfinger.ts';

const webfingerController: AppController = async (c) => {
  const { hostname } = new URL(Conf.localDomain);

  /** Transforms the resource URI into a `[username, domain]` tuple. */
  const acctSchema = urlTransformSchema
    .refine((uri) => uri.protocol === 'acct:', 'Protocol must be `acct:`')
    .refine((uri) => z.string().email().safeParse(uri.pathname).success, 'Invalid acct')
    .transform((uri) => uri.pathname.split('@') as [username: string, host: string])
    .refine(([_username, host]) => host === hostname, 'Host must be local');

  const result = acctSchema.safeParse(c.req.query('resource'));
  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 400);
  }

  try {
    const user = await db.users.findFirst({ where: { username: result.data[0] } });
    c.header('content-type', 'application/jrd+json');
    return c.body(JSON.stringify(renderWebfinger(user)));
  } catch (_e) {
    return c.json({ error: 'Not found' }, 404);
  }
};

const hostMetaController: AppController = (c) => {
  const template = Conf.url('/.well-known/webfinger?resource={uri}');

  c.header('content-type', 'application/xrd+xml');
  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?><XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0"><Link rel="lrdd" template="${template}" type="application/xrd+xml" /></XRD>`,
  );
};

interface RenderWebfingerOpts {
  pubkey: string;
  username: string;
}

/** Present Nostr user on Webfinger. */
function renderWebfinger({ pubkey, username }: RenderWebfingerOpts): Webfinger {
  const { host } = new URL(Conf.localDomain);
  const apId = Conf.url(`/users/${username}`);

  return {
    subject: `acct:${username}@${host}`,
    aliases: [apId],
    links: [
      {
        rel: 'self',
        type: 'application/activity+json',
        href: apId,
      },
      {
        rel: 'self',
        type: 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
        href: apId,
      },
      {
        rel: 'self',
        type: 'application/nostr+json',
        href: `nostr:${nip19.npubEncode(pubkey)}`,
      },
    ],
  };
}

export { hostMetaController, webfingerController };
