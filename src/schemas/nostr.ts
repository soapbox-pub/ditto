import { getEventHash, verifySignature, z } from '@/deps.ts';

import { jsonSchema, safeUrlSchema } from '../schema.ts';

/** Schema to validate Nostr hex IDs such as event IDs and pubkeys. */
const nostrIdSchema = z.string().regex(/^[0-9a-f]{64}$/);
/** Nostr kinds are positive integers. */
const kindSchema = z.number().int().nonnegative();

/** Nostr event schema. */
const eventSchema = z.object({
  id: nostrIdSchema,
  kind: kindSchema,
  tags: z.array(z.array(z.string())),
  content: z.string(),
  created_at: z.number(),
  pubkey: nostrIdSchema,
  sig: z.string(),
});

/** Nostr event schema that also verifies the event's signature. */
const signedEventSchema = eventSchema
  .refine((event) => event.id === getEventHash(event), 'Event ID does not match hash')
  .refine(verifySignature, 'Event signature is invalid');

/** Nostr relay filter schema. */
const filterSchema = z.object({
  kinds: kindSchema.array().optional(),
  ids: nostrIdSchema.array().optional(),
  authors: nostrIdSchema.array().optional(),
  since: z.number().int().nonnegative().optional(),
  until: z.number().int().nonnegative().optional(),
  limit: z.number().int().nonnegative().optional(),
  search: z.string().optional(),
}).passthrough().and(
  z.record(
    z.custom<`#${string}`>((val) => typeof val === 'string' && val.startsWith('#')),
    z.string().array(),
  ).catch({}),
);

const clientReqSchema = z.tuple([z.literal('REQ'), z.string().min(1)]).rest(filterSchema);
const clientEventSchema = z.tuple([z.literal('EVENT'), signedEventSchema]);
const clientCloseSchema = z.tuple([z.literal('CLOSE'), z.string().min(1)]);
const clientCountSchema = z.tuple([z.literal('COUNT'), z.string().min(1)]).rest(filterSchema);

/** Client message to a Nostr relay. */
const clientMsgSchema = z.union([
  clientReqSchema,
  clientEventSchema,
  clientCloseSchema,
  clientCountSchema,
]);

/** REQ message from client to relay. */
type ClientREQ = z.infer<typeof clientReqSchema>;
/** EVENT message from client to relay. */
type ClientEVENT = z.infer<typeof clientEventSchema>;
/** CLOSE message from client to relay. */
type ClientCLOSE = z.infer<typeof clientCloseSchema>;
/** COUNT message from client to relay. */
type ClientCOUNT = z.infer<typeof clientCountSchema>;
/** Client message to a Nostr relay. */
type ClientMsg = z.infer<typeof clientMsgSchema>;

/** Kind 0 content schema. */
const metaContentSchema = z.object({
  name: z.string().optional().catch(undefined),
  about: z.string().optional().catch(undefined),
  picture: z.string().optional().catch(undefined),
  banner: z.string().optional().catch(undefined),
  nip05: z.string().optional().catch(undefined),
  lud16: z.string().optional().catch(undefined),
}).partial().passthrough();

/** Media data schema from `"media"` tags. */
const mediaDataSchema = z.object({
  blurhash: z.string().optional().catch(undefined),
  cid: z.string().optional().catch(undefined),
  description: z.string().max(200).optional().catch(undefined),
  height: z.number().int().positive().optional().catch(undefined),
  mime: z.string().optional().catch(undefined),
  name: z.string().optional().catch(undefined),
  size: z.number().int().positive().optional().catch(undefined),
  width: z.number().int().positive().optional().catch(undefined),
});

/** Media data from `"media"` tags. */
type MediaData = z.infer<typeof mediaDataSchema>;

/** Parses kind 0 content from a JSON string. */
const jsonMetaContentSchema = jsonSchema.pipe(metaContentSchema).catch({});

/** Parses media data from a JSON string. */
const jsonMediaDataSchema = jsonSchema.pipe(mediaDataSchema).catch({});

/** NIP-11 Relay Information Document. */
const relayInfoDocSchema = z.object({
  name: z.string().transform((val) => val.slice(0, 30)).optional().catch(undefined),
  description: z.string().transform((val) => val.slice(0, 3000)).optional().catch(undefined),
  pubkey: nostrIdSchema.optional().catch(undefined),
  contact: safeUrlSchema.optional().catch(undefined),
  supported_nips: z.number().int().nonnegative().array().optional().catch(undefined),
  software: safeUrlSchema.optional().catch(undefined),
  icon: safeUrlSchema.optional().catch(undefined),
});

/** NIP-46 signer response. */
const connectResponseSchema = z.object({
  id: z.string(),
  result: signedEventSchema,
});

export {
  type ClientCLOSE,
  type ClientCOUNT,
  type ClientEVENT,
  type ClientMsg,
  clientMsgSchema,
  type ClientREQ,
  connectResponseSchema,
  filterSchema,
  jsonMediaDataSchema,
  jsonMetaContentSchema,
  type MediaData,
  mediaDataSchema,
  metaContentSchema,
  nostrIdSchema,
  relayInfoDocSchema,
  signedEventSchema,
};
