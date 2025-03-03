import { TestApp } from '@ditto/mastoapi/test';
import { assertEquals } from '@std/assert';

import route from './dittoNamesRoute.ts';

Deno.test('POST / creates a name request event', async () => {
  await using app = new TestApp(route);
  const { conf, relay } = app.var;

  const user = app.user();

  const response = await app.api.post('/', { name: 'Alex@Ditto.pub', reason: 'for testing' });

  assertEquals(response.status, 200);

  const [event] = await relay.query([{ kinds: [3036], authors: [await user.signer.getPublicKey()] }]);

  assertEquals(event?.tags, [
    ['r', 'Alex@Ditto.pub'],
    ['r', 'alex@ditto.pub'],
    ['L', 'nip05.domain'],
    ['l', 'ditto.pub', 'nip05.domain'],
    ['p', await conf.signer.getPublicKey()],
  ]);

  assertEquals(event?.content, 'for testing');
});

Deno.test('POST / can be called multiple times with the same name', async () => {
  await using app = new TestApp(route);

  app.user();

  const response1 = await app.api.post('/', { name: 'alex@ditto.pub' });
  const response2 = await app.api.post('/', { name: 'alex@ditto.pub' });

  assertEquals(response1.status, 200);
  assertEquals(response2.status, 200);
});

Deno.test('POST / returns 400 if the name has already been granted', async () => {
  await using app = new TestApp(route);
  const { conf, relay } = app.var;

  app.user();

  const grant = await conf.signer.signEvent({
    kind: 30360,
    tags: [['d', 'alex@ditto.pub']],
    content: '',
    created_at: 0,
  });

  await relay.event(grant);

  const response = await app.api.post('/', { name: 'alex@ditto.pub' });

  assertEquals(response.status, 400);
});
