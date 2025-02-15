import { Hono } from '@hono/hono';
import { assertEquals } from '@std/assert';

import { confMw } from './confMw.ts';

Deno.test('confMw', async () => {
  const env = new Map([
    ['DITTO_NSEC', 'nsec19shyxpuzd0cq2p5078fwnws7tyykypud6z205fzhlmlrs2vpz6hs83zwkw'],
  ]);

  const app = new Hono();

  app.get('/', confMw(env), (c) => c.text(c.var.conf.pubkey));

  const response = await app.request('/');
  const body = await response.text();

  assertEquals(body, '1ba0c5ed1bbbf3b7eb0d7843ba16836a0201ea68a76bafcba507358c45911ff6');
});
