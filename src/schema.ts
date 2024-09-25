import ISO6391 from 'iso-639-1';
import { z } from 'zod';

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

/** https://developer.mozilla.org/en-US/docs/Glossary/Base64#the_unicode_problem */
const decode64Schema = z.string().transform((value, ctx) => {
  try {
    const binString = atob(value);
    const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0)!);
    return new TextDecoder().decode(bytes);
  } catch (_e) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid base64', fatal: true });
    return z.NEVER;
  }
});

/** Parses a hashtag, eg `#yolo`. */
const hashtagSchema = z.string().regex(/^\w{1,30}$/);

/**
 * Limits the length before trying to parse the URL.
 * https://stackoverflow.com/a/417184/8811886
 */
const safeUrlSchema = z.string().max(2048).url();

/** https://github.com/colinhacks/zod/issues/1630#issuecomment-1365983831 */
const booleanParamSchema = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Schema for `File` objects. */
const fileSchema = z.custom<File>((value) => value instanceof File);

const percentageSchema = z.coerce.number().int().gte(1).lte(100);

const languageSchema = z.string().transform((val, ctx) => {
  if (!ISO6391.validate(val)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Not a valid language in ISO-639-1 format',
    });
    return z.NEVER;
  }
  return val;
});

export {
  booleanParamSchema,
  decode64Schema,
  fileSchema,
  filteredArray,
  hashtagSchema,
  languageSchema,
  percentageSchema,
  safeUrlSchema,
};
