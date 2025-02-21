import { z } from 'zod';

export const proofSchema = z.object({
  id: z.string(),
  amount: z.number(),
  secret: z.string(),
  C: z.string(),
  dleq: z.object({ s: z.string(), e: z.string(), r: z.string().optional() }).optional(),
  dleqValid: z.boolean().optional(),
});
