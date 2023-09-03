import { type Event, type EventTemplate } from '@/deps.ts';
import { decode64Schema, jsonSchema } from '@/schema.ts';
import { signedEventSchema } from '@/schemas/nostr.ts';
import { eventAge, findTag, nostrNow, sha256 } from '@/utils.ts';
import { Time } from '@/utils/time.ts';

/** Decode a Nostr event from a base64 encoded string. */
const decode64EventSchema = decode64Schema.pipe(jsonSchema).pipe(signedEventSchema);

interface ParseAuthRequestOpts {
  /** Max event age (in ms). */
  maxAge?: number;
  /** Whether to validate the request body of the request with the payload of the auth event. (default: `true`) */
  validatePayload?: boolean;
}

/** Parse the auth event from a Request, returning a zod SafeParse type. */
function parseAuthRequest(req: Request, opts: ParseAuthRequestOpts = {}) {
  const { maxAge = Time.minutes(1), validatePayload = true } = opts;

  const header = req.headers.get('authorization');
  const base64 = header?.match(/^Nostr (.+)$/)?.[1];

  const schema = decode64EventSchema
    .refine((event): event is Event<27235> => event.kind === 27235, 'Event must be kind 27235')
    .refine((event) => eventAge(event) < maxAge, 'Event expired')
    .refine((event) => tagValue(event, 'method') === req.method, 'Event method does not match HTTP request method')
    .refine((event) => tagValue(event, 'u') === req.url, 'Event URL does not match request URL')
    .refine(validateBody, 'Event payload does not match request body');

  function validateBody(event: Event<27235>) {
    if (!validatePayload) return true;
    return req.clone().text()
      .then(sha256)
      .then((hash) => hash === tagValue(event, 'payload'));
  }

  return schema.safeParseAsync(base64);
}

/** Create an auth EventTemplate from a Request. */
async function buildAuthEventTemplate(req: Request): Promise<EventTemplate<27235>> {
  const { method, url } = req;
  const payload = await req.clone().text().then(sha256);

  return {
    kind: 27235,
    content: '',
    tags: [
      ['method', method],
      ['u', url],
      ['payload', payload],
    ],
    created_at: nostrNow(),
  };
}

/** Get the value for the first matching tag name in the event. */
function tagValue(event: Event, tagName: string): string | undefined {
  return findTag(event.tags, tagName)?.[1];
}

export { buildAuthEventTemplate, parseAuthRequest, type ParseAuthRequestOpts };
