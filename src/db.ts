import { createPentagon, z } from '@/deps.ts';

const kv = await Deno.openKv();

const userSchema = z.object({
  pubkey: z.string().regex(/^[0-9a-f]{64}$/).describe('primary'),
  username: z.string().regex(/^[\w_]+$/).describe('unique'),
  createdAt: z.date(),
});

const db = createPentagon(kv, {
  users: {
    schema: userSchema,
  },
});

export { db };
