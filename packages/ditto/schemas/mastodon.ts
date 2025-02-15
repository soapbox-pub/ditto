import { z } from 'zod';

/** https://docs.joinmastodon.org/entities/Instance/#thumbnail */
const thumbnailSchema = z.object({
  url: z.string().url(),
  blurhash: z.string().optional(),
  versions: z.object({
    '@1x': z.string().url().optional(),
    '@2x': z.string().url().optional(),
  }).optional(),
});

export { thumbnailSchema };
