import { Hono } from '@hono/hono';
import { assertEquals } from '@std/assert';

import { cacheControlMiddleware } from '@/middleware/cacheControlMiddleware.ts';

Deno.test('cacheControlMiddleware with multiple options', async () => {
  const app = new Hono();

  app.use(cacheControlMiddleware({
    maxAge: 31536000,
    public: true,
    immutable: true,
  }));

  app.get('/', (c) => c.text('OK'));

  const response = await app.request('/');
  const cacheControl = response.headers.get('Cache-Control');

  assertEquals(cacheControl, 'max-age=31536000, public, immutable');
});

Deno.test('cacheControlMiddleware with no options does not add header', async () => {
  const app = new Hono();

  app.use(cacheControlMiddleware({}));
  app.get('/', (c) => c.text('OK'));

  const response = await app.request('/');
  const cacheControl = response.headers.get('Cache-Control');

  assertEquals(cacheControl, null);
});
