import { Conf } from '@/config.ts';
import { db } from '@/db.ts';
import { nip19, z } from '@/deps.ts';
import { npubSchema } from '@/schema.ts';

import type { AppController } from '@/app.ts';
import type { Webfinger } from '@/schemas/webfinger.ts';

/** Transforms the resource URI into a `[username, domain]` tuple. */
const acctSchema = z.custom<URL>((value) => value instanceof URL)
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
      const [username] = acctSchema.parse(resource);
      const user = await db.users.findFirst({ where: { username } });
      c.header('content-type', 'application/jrd+json');
      return c.body(JSON.stringify(renderWebfinger({ ...user, resource })));
    } catch (e) {
      if (e instanceof z.ZodError) {
        return c.json({ error: 'Invalid acct URI', schema: e }, 400);
      } else {
        return c.json({ error: 'Not found' }, 404);
      }
    }
  };

  const handleNostr = async (): Promise<Response> => {
    try {
      const pubkey = npubSchema.parse(resource.pathname);
      const user = await db.users.findFirst({ where: { pubkey } });
      c.header('content-type', 'application/jrd+json');
      return c.body(JSON.stringify(renderWebfinger({ ...user, resource })));
    } catch (e) {
      if (e instanceof z.ZodError) {
        return c.json({ error: 'Invalid Nostr URI', schema: e }, 400);
      } else {
        return c.json({ error: 'Not found' }, 404);
      }
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
  resource: URL;
}

/** Present Nostr user on Webfinger. */
function renderWebfinger({ pubkey, username, resource }: RenderWebfingerOpts): Webfinger {
  const apId = Conf.url(`/users/${username}`);

  return {
    subject: resource.toString(),
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
