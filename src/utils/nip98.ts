import { NostrEvent, NSchema as n } from '@nostrify/nostrify';
import { EventTemplate, nip13 } from 'nostr-tools';

import { decode64Schema } from '@/schema.ts';
import { signedEventSchema } from '@/schemas/nostr.ts';
import { eventAge, findTag, nostrNow, sha256 } from '@/utils.ts';
import { Time } from '@/utils/time.ts';

/** Decode a Nostr event from a base64 encoded string. */
const decode64EventSchema = decode64Schema.pipe(n.json()).pipe(signedEventSchema);

interface ParseAuthRequestOpts {
  /** Max event age (in ms). */
  maxAge?: number;
  /** Whether to validate the request body of the request with the payload of the auth event. (default: `true`) */
  validatePayload?: boolean;
  /** Difficulty of the proof of work. (default: `0`) */
  pow?: number;
}

/** Parse the auth event from a Request, returning a zod SafeParse type. */
// deno-lint-ignore require-await
async function parseAuthRequest(req: Request, opts: ParseAuthRequestOpts = {}) {
  const header = req.headers.get('authorization');
  const base64 = header?.match(/^Nostr (.+)$/)?.[1];
  const result = decode64EventSchema.safeParse(base64);

  if (!result.success) return result;
  return validateAuthEvent(req, result.data, opts);
}

/** Compare the auth event with the request, returning a zod SafeParse type. */
function validateAuthEvent(req: Request, event: NostrEvent, opts: ParseAuthRequestOpts = {}) {
  const { maxAge = Time.minutes(1), validatePayload = true, pow = 0 } = opts;

  const schema = signedEventSchema
    .refine((event) => event.kind === 27235, 'Event must be kind 27235')
    .refine((event) => eventAge(event) < maxAge, 'Event expired')
    .refine((event) => tagValue(event, 'method') === req.method, 'Event method does not match HTTP request method')
    .refine((event) => tagValue(event, 'u') === req.url, 'Event URL does not match request URL')
    .refine((event) => pow ? nip13.getPow(event.id) >= pow : true, 'Insufficient proof of work')
    .refine(validateBody, 'Event payload does not match request body');

  function validateBody(event: NostrEvent) {
    if (!validatePayload) return true;
    return req.clone().text()
      .then(sha256)
      .then((hash) => hash === tagValue(event, 'payload'));
  }

  return schema.safeParseAsync(event);
}

/** Create an auth EventTemplate from a Request. */
async function buildAuthEventTemplate(req: Request, opts: ParseAuthRequestOpts = {}): Promise<EventTemplate> {
  const { validatePayload = true } = opts;
  const { method, url } = req;

  const tags = [
    ['method', method],
    ['u', url],
  ];

  if (validatePayload) {
    const payload = await req.clone().text().then(sha256);
    tags.push(['payload', payload]);
  }

  return {
    kind: 27235,
    content: '',
    tags,
    created_at: nostrNow(),
  };
}

/** Get the value for the first matching tag name in the event. */
function tagValue(event: NostrEvent, tagName: string): string | undefined {
  return findTag(event.tags, tagName)?.[1];
}

export { buildAuthEventTemplate, parseAuthRequest, type ParseAuthRequestOpts, validateAuthEvent };
