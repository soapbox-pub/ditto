import { type NostrEvent, NSchema as n } from '@nostrify/nostrify';
import { encodeHex } from '@std/encoding/hex';
import { type EventTemplate, nip13 } from 'nostr-tools';

import { decode64Schema, signedEventSchema } from './schema.ts';

import type { z } from 'zod';

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
async function parseAuthRequest(
  req: Request,
  opts: ParseAuthRequestOpts = {},
): Promise<z.SafeParseReturnType<NostrEvent, NostrEvent> | z.SafeParseError<string>> {
  const header = req.headers.get('authorization');
  const base64 = header?.match(/^Nostr (.+)$/)?.[1];
  const result = decode64EventSchema.safeParse(base64);

  if (!result.success) return result;
  return validateAuthEvent(req, result.data, opts);
}

/** Compare the auth event with the request, returning a zod SafeParse type. */
function validateAuthEvent(
  req: Request,
  event: NostrEvent,
  opts: ParseAuthRequestOpts = {},
): Promise<z.SafeParseReturnType<NostrEvent, NostrEvent>> {
  const { maxAge = 60_000, validatePayload = true, pow = 0 } = opts;

  const schema = signedEventSchema
    .refine((event) => event.kind === 27235, 'Event must be kind 27235')
    .refine((event) => eventAge(event) < maxAge, 'Event expired')
    .refine((event) => tagValue(event, 'method') === req.method, 'Event method does not match HTTP request method')
    .refine((event) => tagValue(event, 'u') === req.url, 'Event URL does not match request URL')
    .refine((event) => pow ? nip13.getPow(event.id) >= pow : true, 'Insufficient proof of work')
    .refine(validateBody, 'Event payload does not match request body');

  async function validateBody(event: NostrEvent): Promise<boolean> {
    if (!validatePayload) return true;
    const payload = await getPayload(req);
    return payload === tagValue(event, 'payload');
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
    const payload = await getPayload(req);
    tags.push(['payload', payload]);
  }

  return {
    kind: 27235,
    content: '',
    tags,
    created_at: nostrNow(),
  };
}

/** Get a SHA-256 hash of the request body encoded as a hex string. */
async function getPayload(req: Request): Promise<string> {
  const text = await req.clone().text();
  const bytes = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest('SHA-256', bytes);
  return encodeHex(buffer);
}

/** Get the value for the first matching tag name in the event. */
function tagValue(event: NostrEvent, tagName: string): string | undefined {
  return findTag(event.tags, tagName)?.[1];
}

/** Get the current time in Nostr format. */
const nostrNow = (): number => Math.floor(Date.now() / 1000);

/** Convenience function to convert Nostr dates into native Date objects. */
const nostrDate = (seconds: number): Date => new Date(seconds * 1000);

/** Return the event's age in milliseconds. */
function eventAge(event: NostrEvent): number {
  return Date.now() - nostrDate(event.created_at).getTime();
}

function findTag(tags: string[][], name: string): string[] | undefined {
  return tags.find((tag) => tag[0] === name);
}

export { buildAuthEventTemplate, parseAuthRequest, type ParseAuthRequestOpts, validateAuthEvent };
