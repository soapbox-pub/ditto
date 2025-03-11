import { z } from 'zod';

export const proofSchema: z.ZodType<{
  id: string;
  amount: number;
  secret: string;
  C: string;
  dleq?: { s: string; e: string; r?: string };
  dleqValid?: boolean;
}> = z.object({
  id: z.string(),
  amount: z.number(),
  secret: z.string(),
  C: z.string(),
  dleq: z.object({ s: z.string(), e: z.string(), r: z.string().optional() }).optional(),
  dleqValid: z.boolean().optional(),
});

/** Decrypted content of a kind 7375 */
export const tokenEventSchema: z.ZodType<{
  mint: string;
  proofs: Array<z.infer<typeof proofSchema>>;
  del?: string[];
}> = z.object({
  mint: z.string().url(),
  proofs: proofSchema.array(),
  del: z.string().array().optional(),
});
