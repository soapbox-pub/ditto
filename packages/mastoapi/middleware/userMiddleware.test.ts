import { setUser, testApp } from '@ditto/mastoapi/test';
import { assertEquals } from '@std/assert';

import { userMiddleware } from './userMiddleware.ts';
import { ReadOnlySigner } from '../signers/ReadOnlySigner.ts';

Deno.test('no user 401', async () => {
  const { app } = testApp();
  const response = await app.use(userMiddleware()).request('/');
  assertEquals(response.status, 401);
});

Deno.test('unsupported signer 400', async () => {
  const { app, relay } = testApp();
  const signer = new ReadOnlySigner('0461fcbecc4c3374439932d6b8f11269ccdb7cc973ad7a50ae362db135a474dd');

  const response = await app
    .use(setUser({ signer, relay }))
    .use(userMiddleware({ enc: 'nip44' }))
    .use((c, next) => {
      c.var.user.signer.nip44.encrypt; // test that the type is set
      return next();
    })
    .request('/');

  assertEquals(response.status, 400);
});

Deno.test('with user 200', async () => {
  const { app, user } = testApp();

  const response = await app
    .use(setUser(user))
    .use(userMiddleware())
    .get('/', (c) => c.text('ok'))
    .request('/');

  assertEquals(response.status, 200);
});

Deno.test('user and role 403', async () => {
  const { app, user } = testApp();

  const response = await app
    .use(setUser(user))
    .use(userMiddleware({ role: 'admin' }))
    .request('/');

  assertEquals(response.status, 403);
});

Deno.test('admin role 200', async () => {
  const { conf, app, user, relay } = testApp();

  const event = await conf.signer.signEvent({
    kind: 30382,
    tags: [
      ['d', await user.signer.getPublicKey()],
      ['n', 'admin'],
    ],
    content: '',
    created_at: Math.floor(Date.now() / 1000),
  });

  await relay.event(event);

  const response = await app
    .use(setUser(user))
    .use(userMiddleware({ role: 'admin' }))
    .get('/', (c) => c.text('ok'))
    .request('/');

  assertEquals(response.status, 200);
});
