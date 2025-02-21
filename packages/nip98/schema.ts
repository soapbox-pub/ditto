import { NSchema as n } from '@nostrify/nostrify';
import { getEventHash, verifyEvent } from 'nostr-tools';
import z from 'zod';

/** https://developer.mozilla.org/en-US/docs/Glossary/Base64#the_unicode_problem */
export const decode64Schema = z.string().transform((value, ctx) => {
  try {
    const binString = atob(value);
    const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0)!);
    return new TextDecoder().decode(bytes);
  } catch (_e) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid base64', fatal: true });
    return z.NEVER;
  }
});

/** Nostr event schema that also verifies the event's signature. */
export const signedEventSchema = n.event()
  .refine((event) => event.id === getEventHash(event), 'Event ID does not match hash')
  .refine(verifyEvent, 'Event signature is invalid');
