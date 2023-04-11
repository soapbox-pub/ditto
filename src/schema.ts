import { z } from '@/deps.ts';

const jsonSchema = z.string().transform((value, ctx) => {
  try {
    return JSON.parse(value);
  } catch (_e) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid JSON' });
    return z.NEVER;
  }
});

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

export { jsonSchema, parseRelay, relaySchema };
