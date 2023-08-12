import { verifySignature, z } from '@/deps.ts';

import { jsonSchema } from '../schema.ts';

/** Schema to validate Nostr hex IDs such as event IDs and pubkeys. */
const nostrIdSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** Nostr event schema. */
const eventSchema = z.object({
  id: nostrIdSchema,
  kind: z.number(),
  tags: z.array(z.array(z.string())),
  content: z.string(),
  created_at: z.number(),
  pubkey: nostrIdSchema,
  sig: z.string(),
});

/** Nostr event schema that also verifies the event's signature. */
const signedEventSchema = eventSchema.refine(verifySignature);

/** Nostr relay filter schema. */
const filterSchema = z.object({
  kinds: z.number().int().positive().array().optional(),
  ids: nostrIdSchema.array().optional(),
  authors: nostrIdSchema.array().optional(),
  since: z.number().int().positive().optional(),
  until: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
}).and(z.record(
  z.custom<`#${string}`>((val) => typeof val === 'string' && val.startsWith('#')),
  z.string().array(),
));

/** Client message to a Nostr relay. */
const clientMsgSchema = z.union([
  z.tuple([z.literal('REQ'), z.string().min(1)]).rest(filterSchema),
  z.tuple([z.literal('EVENT'), signedEventSchema]),
  z.tuple([z.literal('CLOSE'), z.string().min(1)]),
]);

/** Kind 0 content schema. */
const metaContentSchema = z.object({
  name: z.string().optional().catch(undefined),
  about: z.string().optional().catch(undefined),
  picture: z.string().optional().catch(undefined),
  banner: z.string().optional().catch(undefined),
  nip05: z.string().optional().catch(undefined),
  lud16: z.string().optional().catch(undefined),
}).partial().passthrough();

/** Parses kind 0 content from a JSON string. */
const jsonMetaContentSchema = jsonSchema.pipe(metaContentSchema).catch({});

export { clientMsgSchema, filterSchema, jsonMetaContentSchema, metaContentSchema, nostrIdSchema, signedEventSchema };
