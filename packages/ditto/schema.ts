import ISO6391, { LanguageCode } from 'iso-639-1';
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

const languageSchema = z.string().transform<LanguageCode>((val, ctx) => {
  val = val.toLowerCase();
  if (!ISO6391.validate(val)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Not a valid language in ISO-639-1 format',
    });
    return z.NEVER;
  }
  return val;
});

const localeSchema = z.string().transform<Intl.Locale>((val, ctx) => {
  try {
    return new Intl.Locale(val);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid locale',
    });
    return z.NEVER;
  }
});

/** White-space separated list of sizes, each in the format <number with up to 4 digits>x<number with up to 4 digits> or with "X" in upper case. */
const sizesSchema = z.string().refine((value) =>
  value.split(' ').every((v) => /^[1-9]\d{0,3}[xX][1-9]\d{0,3}$/.test(v))
);

export {
  booleanParamSchema,
  fileSchema,
  filteredArray,
  hashtagSchema,
  languageSchema,
  localeSchema,
  percentageSchema,
  safeUrlSchema,
  sizesSchema,
};
