import { z } from '@/deps.ts';

const jsonSchema = z.string().refine((value) => {
  try {
    // FIXME: this calls JSON.parse twice. Can we make it not do that?
    // https://github.com/colinhacks/zod/discussions/2215
    JSON.parse(value);
    return true;
  } catch (_) {
    return false;
  }
}).transform((value) => JSON.parse(value));

const optionalString = z.string().optional().catch(undefined);

const metaContentSchema = z.object({
  name: optionalString,
  about: optionalString,
  picture: optionalString,
  banner: optionalString,
  nip05: optionalString,
  lud16: optionalString,
});

type MetaContent = z.infer<typeof metaContentSchema>;

export { jsonSchema, metaContentSchema };
export type { MetaContent };
