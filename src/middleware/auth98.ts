import { type AppMiddleware } from '@/app.ts';
import { Conf } from '@/config.ts';
import { type Event, HTTPException } from '@/deps.ts';
import { decode64Schema, jsonSchema } from '@/schema.ts';
import { signedEventSchema } from '@/schemas/nostr.ts';
import { eventAge, findTag, sha256, Time } from '@/utils.ts';

const decodeEventSchema = decode64Schema.pipe(jsonSchema).pipe(signedEventSchema);

interface Auth98Opts {
  timeout?: number;
}

/**
 * NIP-98 auth.
 * https://github.com/nostr-protocol/nips/blob/master/98.md
 */
function auth98(opts: Auth98Opts = {}): AppMiddleware {
  return async (c, next) => {
    const authHeader = c.req.headers.get('authorization');
    const base64 = authHeader?.match(/^Nostr (.+)$/)?.[1];
    const { timeout = Time.minutes(1) } = opts;

    const schema = decodeEventSchema
      .refine((event) => event.kind === 27235)
      .refine((event) => eventAge(event) < timeout)
      .refine((event) => findTag(event.tags, 'method')?.[1] === c.req.method)
      .refine((event) => {
        const url = findTag(event.tags, 'u')?.[1];
        try {
          return url === Conf.local(c.req.url);
        } catch (_e) {
          return false;
        }
      })
      .refine(async (event) => {
        const body = await c.req.raw.clone().text();
        if (!body) return true;
        const hash = findTag(event.tags, 'payload')?.[1];
        return hash === await sha256(body);
      });

    const result = await schema.safeParseAsync(base64);

    if (result.success) {
      c.set('pubkey', result.data.pubkey);
      c.set('proof', result.data as Event<27235>);
    }

    await next();
  };
}

const requireProof: AppMiddleware = async (c, next) => {
  const pubkey = c.get('pubkey');
  const proof = c.get('proof');

  // if (!proof && hasWebsocket(c.req)) {
  //   // TODO: attempt to sign nip98 event through websocket
  // }

  if (!pubkey || !proof || proof.pubkey !== pubkey) {
    throw new HTTPException(401);
  }

  await next();
};

export { auth98, requireProof };
