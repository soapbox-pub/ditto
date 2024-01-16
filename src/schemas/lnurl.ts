import { z } from '@/deps.ts';

import { nostrIdSchema } from './nostr.ts';

const lnurlResponseSchema = z.object({
  callback: z.string().url(),
  maxSendable: z.number().int().nonnegative(),
  minSendable: z.number().int().positive(),
  metadata: z.string(),
  tag: z.string(),
  allowsNostr: z.boolean().optional(),
  nostrPubkey: nostrIdSchema.optional(),
});

const lnurlCallbackResponseSchema = z.object({
  pr: z.string(),
  routes: z.unknown().array(),
});

export { lnurlCallbackResponseSchema, lnurlResponseSchema };
