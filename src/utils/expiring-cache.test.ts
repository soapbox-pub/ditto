import { assert } from '@std/assert';

import ExpiringCache from './expiring-cache.ts';

Deno.test('ExpiringCache', async () => {
  const cache = new ExpiringCache(await caches.open('test'));

  await cache.putExpiring('http://mostr.local/1', new Response('hello world'), 300);
  await cache.putExpiring('http://mostr.local/2', new Response('hello world'), -1);

  // const resp1 = await cache.match('http://mostr.local/1');
  const resp2 = await cache.match('http://mostr.local/2');

  // assert(resp1!.headers.get('Expires'));
  assert(!resp2);

  // await resp1!.text();
});
