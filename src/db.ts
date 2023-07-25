import { createPentagon, z } from '@/deps.ts';
import { hexIdSchema } from '@/schema.ts';

const kv = await Deno.openKv();

const userSchema = z.object({
  pubkey: hexIdSchema.describe('primary'),
  username: z.string().regex(/^\w{1,30}$/).describe('unique'),
  createdAt: z.date(),
});

const db = createPentagon(kv, {
  users: {
    schema: userSchema,
  },
});

export { db };
