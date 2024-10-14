import { Hono } from '@hono/hono';
import { NSecSigner } from '@nostrify/nostrify';
import { generateSecretKey } from 'nostr-tools';

import { type AppEnv } from '@/app.ts';
import { createTestDB } from '@/test.ts';
import { pushSubscribeController } from '@/controllers/api/push.ts';
import { assertEquals } from '@std/assert';

Deno.test('POST /api/v1/push/subscription creates the subscription in the database', async () => {
  await using db = await createTestDB();
  const signer = new NSecSigner(generateSecretKey());

  const app = new Hono<AppEnv>().all((c) => {
    c.set('kysely', db.kysely);
    c.set('store', db.store);
    c.set('signer', signer);
  }, pushSubscribeController);

  const response = await app.request('/api/v1/push/subscription', {
    body: JSON.stringify({
      endpoint: 'https://example.com',
      keys: {
        p256dh: 'p256dh',
        auth: 'auth',
      },
    }),
  });

  assertEquals(response.status, 200);
});
