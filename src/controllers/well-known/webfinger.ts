import { Conf } from '@/config.ts';
import { db } from '@/db.ts';
import { nip19, z } from '@/deps.ts';
import { urlTransformSchema } from '@/schema.ts';

import type { AppController } from '@/app.ts';
import type { Webfinger } from '@/schemas/webfinger.ts';

/** Transforms the resource URI into a `[username, domain]` tuple. */
const acctSchema = urlTransformSchema
  .transform((uri) => uri.pathname)
  .pipe(z.string().email('Invalid acct'))
  .transform((acct) => acct.split('@') as [username: string, host: string])
  .refine(([_username, host]) => host === new URL(Conf.localDomain).hostname, {
    message: 'Host must be local',
    path: ['resource', 'acct'],
  });

const webfingerQuerySchema = z.object({
  resource: z.string().url(),
});

const webfingerController: AppController = (c) => {
  const query = webfingerQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    return c.json({ error: 'Bad request', schema: query.error }, 400);
  }

  const resource = new URL(query.data.resource);

  const handleAcct = async (): Promise<Response> => {
    try {
      const [username] = acctSchema.parse(query.data.resource);
      const user = await db.users.findFirst({ where: { username } });
      c.header('content-type', 'application/jrd+json');
      return c.body(JSON.stringify(renderWebfinger({ ...user, resource: query.data.resource })));
    } catch (_e) {
      return c.json({ error: 'Not found' }, 404);
    }
  };

  const handleNostr = async (): Promise<Response> => {
    try {
      const decoded = nip19.decode(resource.pathname);
      if (decoded.type === 'npub') {
        const user = await db.users.findFirst({ where: { pubkey: decoded.data } });
        if (!user) {
          return c.json({ error: 'Not found' }, 404);
        }
        c.header('content-type', 'application/jrd+json');
        return c.body(JSON.stringify(renderWebfinger({ ...user, resource: query.data.resource })));
      } else {
        return c.json({ error: 'Unsupported Nostr URI' }, 400);
      }
    } catch (_e) {
      return c.json({ error: 'Invalid Nostr URI' }, 404);
    }
  };

  switch (resource.protocol) {
    case 'acct:': {
      return handleAcct();
    }
    case 'nostr:': {
      return handleNostr();
    }
    default:
      return c.json({ error: 'Unsupported URI scheme' }, 400);
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
  resource: string;
}

/** Present Nostr user on Webfinger. */
function renderWebfinger({ pubkey, username, resource }: RenderWebfingerOpts): Webfinger {
  const apId = Conf.url(`/users/${username}`);

  return {
    subject: resource,
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
