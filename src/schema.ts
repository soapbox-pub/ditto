import { z } from '@/deps.ts';

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

export { metaContentSchema };
export type { MetaContent };
