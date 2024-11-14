import { NSchema as n } from '@nostrify/nostrify';
import { getEventHash, verifyEvent } from 'nostr-tools';
import { z } from 'zod';

import { safeUrlSchema, sizesSchema } from '@/schema.ts';

/** Nostr event schema that also verifies the event's signature. */
const signedEventSchema = n.event()
  .refine((event) => event.id === getEventHash(event), 'Event ID does not match hash')
  .refine(verifyEvent, 'Event signature is invalid');

/**
 * Stored in the kind 0 content.
 * https://developer.mozilla.org/en-US/docs/Web/Manifest/screenshots
 */
const screenshotsSchema = z.array(z.object({
  form_factor: z.enum(['narrow', 'wide']).optional(),
  label: z.string().optional(),
  platform: z.enum([
    'android',
    'chromeos',
    'ipados',
    'ios',
    'kaios',
    'macos',
    'windows',
    'xbox',
    'chrome_web_store',
    'itunes',
    'microsoft-inbox',
    'microsoft-store',
    'play',
  ]).optional(),
  /** https://developer.mozilla.org/en-US/docs/Web/Manifest/screenshots#sizes */
  sizes: sizesSchema.optional(),
  /** Absolute URL. */
  src: z.string().url(),
  /** MIME type of the image. */
  type: z.string().optional(),
}));

/** Kind 0 content schema for the Ditto server admin user. */
const serverMetaSchema = n.metadata().and(z.object({
  tagline: z.string().optional().catch(undefined),
  email: z.string().optional().catch(undefined),
  screenshots: screenshotsSchema.optional(),
}));

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

export { type EmojiTag, emojiTagSchema, relayInfoDocSchema, screenshotsSchema, serverMetaSchema, signedEventSchema };
