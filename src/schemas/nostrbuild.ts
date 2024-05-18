import { z } from 'zod';

export const nostrbuildFileSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  thumbnail: z.string(),
  blurhash: z.string(),
  sha256: z.string(),
  original_sha256: z.string(),
  mime: z.string(),
  dimensions: z.object({
    width: z.number(),
    height: z.number(),
  }).optional().catch(undefined),
});

export const nostrbuildSchema = z.object({
  data: nostrbuildFileSchema.array().min(1),
});
