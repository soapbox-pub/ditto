import { NSchema as n } from '@nostrify/nostrify';
import { getEventHash, verifyEvent } from 'nostr-tools';
import { z } from 'zod';

import { safeUrlSchema } from '@/schema.ts';

/** Nostr event schema that also verifies the event's signature. */
const signedEventSchema = n.event()
  .refine((event) => event.id === getEventHash(event), 'Event ID does not match hash')
  .refine(verifyEvent, 'Event signature is invalid');

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

/** Kind 0 content schema for the Ditto server admin user. */
const serverMetaSchema = n.metadata().and(z.object({
  tagline: z.string().optional().catch(undefined),
  email: z.string().optional().catch(undefined),
}));

/** Media data from `"media"` tags. */
type MediaData = z.infer<typeof mediaDataSchema>;

/** NIP-11 Relay Information Document. */
const relayInfoDocSchema = z.object({
  name: z.string().transform((val) => val.slice(0, 30)).optional().catch(undefined),
  description: z.string().transform((val) => val.slice(0, 3000)).optional().catch(undefined),
  pubkey: n.id().optional().catch(undefined),
  contact: safeUrlSchema.optional().catch(undefined),
  supported_nips: z.number().int().nonnegative().array().optional().catch(undefined),
  software: safeUrlSchema.optional().catch(undefined),
  icon: safeUrlSchema.optional().catch(undefined),
});

/** Parses a Nostr emoji tag. */
const emojiTagSchema = z.tuple([z.literal('emoji'), z.string(), z.string().url()]);

/** NIP-30 custom emoji tag. */
type EmojiTag = z.infer<typeof emojiTagSchema>;

export {
  type EmojiTag,
  emojiTagSchema,
  type MediaData,
  mediaDataSchema,
  relayInfoDocSchema,
  serverMetaSchema,
  signedEventSchema,
};
