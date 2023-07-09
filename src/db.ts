import { Dongoose, z } from '@/deps.ts';

const db = await Deno.openKv();

const Users = Dongoose({
  pubkey: z.string(),
  username: z.string(),
}, {
  db,
  name: 'users',
  indexes: ['pubkey', 'username'],
});

export { db, Users };
