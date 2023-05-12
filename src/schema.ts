import { z } from '@/deps.ts';

import type { Event } from './event.ts';

const optionalString = z.string().optional().catch(undefined);

/** Validates individual items in an array, dropping any that aren't valid. */
function filteredArray<T extends z.ZodTypeAny>(schema: T) {
  return z.any().array().catch([])
    .transform((arr) => (
      arr.map((item) => {
        const parsed = schema.safeParse(item);
        return parsed.success ? parsed.data : undefined;
      }).filter((item): item is z.infer<T> => Boolean(item))
    ));
}

const jsonSchema = z.string().transform((value, ctx) => {
  try {
    return JSON.parse(value);
  } catch (_e) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid JSON' });
    return z.NEVER;
  }
});

const metaContentSchema = z.object({
  name: optionalString,
  about: optionalString,
  picture: optionalString,
  banner: optionalString,
  nip05: optionalString,
  lud16: optionalString,
});

/** Author metadata from Event<0>. */
type MetaContent = z.infer<typeof metaContentSchema>;

/**
 * Get (and validate) data from a kind 0 event.
 * https://github.com/nostr-protocol/nips/blob/master/01.md
 */
function parseMetaContent(event: Event<0>): MetaContent {
  try {
    const json = JSON.parse(event.content);
    return metaContentSchema.parse(json);
  } catch (_e) {
    return {};
  }
}

/** Alias for `safeParse`, but instead of returning a success object it returns the value (or undefined on fail). */
function parseValue<T>(schema: z.ZodType<T>, value: unknown): T | undefined {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

const parseRelay = (relay: string | URL) => parseValue(relaySchema, relay);

const relaySchema = z.custom<URL>((relay) => {
  if (typeof relay !== 'string') return false;
  try {
    const { protocol } = new URL(relay);
    return protocol === 'wss:' || protocol === 'ws:';
  } catch (_e) {
    return false;
  }
});

const emojiTagSchema = z.tuple([z.literal('emoji'), z.string(), z.string().url()]);

export {
  emojiTagSchema,
  filteredArray,
  jsonSchema,
  type MetaContent,
  metaContentSchema,
  parseMetaContent,
  parseRelay,
  relaySchema,
};
