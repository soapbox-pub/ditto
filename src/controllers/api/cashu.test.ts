// deno-lint-ignore-file require-await
import { NSecSigner } from '@nostrify/nostrify';
import { assertEquals } from '@std/assert';
import { generateSecretKey } from 'nostr-tools';

import { createTestDB } from '@/test.ts';

import cashuApp from './cashu.ts';

Deno.test('PUT /wallet', async () => {
  await using db = await createTestDB();
  const store = db.store;

  const sk = generateSecretKey();
  const signer = new NSecSigner(sk);

  const app = cashuApp.use(
    '*',
    async (c) => c.set('store', store),
    async (c) => c.set('signer', signer),
  );

  const response = await app.request('/wallet', { method: 'PUT' });

  assertEquals(response.status, 200);
});
