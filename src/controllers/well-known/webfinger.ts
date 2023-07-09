import { Conf } from '@/config.ts';
import { db } from '@/db.ts';
import { nip19, z } from '@/deps.ts';

import type { AppContext, AppController } from '@/app.ts';
import type { Webfinger } from '@/schemas/webfinger.ts';

const webfingerQuerySchema = z.object({
  resource: z.string().url(),
});

const webfingerController: AppController = (c) => {
  const query = webfingerQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    return c.json({ error: 'Bad request', schema: query.error }, 400);
  }

  const resource = new URL(query.data.resource);

  switch (resource.protocol) {
    case 'acct:': {
      return handleAcct(c, resource);
    }
    default:
      return c.json({ error: 'Unsupported URI scheme' }, 400);
  }
};

/** Transforms the resource URI into a `[username, domain]` tuple. */
const acctSchema = z.custom<URL>((value) => value instanceof URL)
  .transform((uri) => uri.pathname)
  .pipe(z.string().email('Invalid acct'))
  .transform((acct) => acct.split('@') as [username: string, host: string])
  .refine(([_username, host]) => host === Conf.url.hostname, {
    message: 'Host must be local',
    path: ['resource', 'acct'],
  });

async function handleAcct(c: AppContext, resource: URL): Promise<Response> {
  try {
    const [username, host] = acctSchema.parse(resource);
    const user = await db.users.findFirst({ where: { username } });

    const json = renderWebfinger({
      pubkey: user.pubkey,
      username: user.username,
      subject: `acct:${username}@${host}`,
    });

    c.header('content-type', 'application/jrd+json');
    return c.body(JSON.stringify(json));
  } catch (e) {
    if (e instanceof z.ZodError) {
      return c.json({ error: 'Invalid acct URI', schema: e }, 400);
    } else {
      return c.json({ error: 'Not found' }, 404);
    }
  }
}

interface RenderWebfingerOpts {
  pubkey: string;
  username: string;
  subject: string;
}

/** Present Nostr user on Webfinger. */
function renderWebfinger({ pubkey, username, subject }: RenderWebfingerOpts): Webfinger {
  const apId = Conf.local(`/users/${username}`);

  return {
    subject,
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

const hostMetaController: AppController = (c) => {
  const template = Conf.local('/.well-known/webfinger?resource={uri}');

  c.header('content-type', 'application/xrd+xml');
  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?><XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0"><Link rel="lrdd" template="${template}" type="application/xrd+xml" /></XRD>`,
  );
};

export { hostMetaController, webfingerController };
