import { TestApp } from '@ditto/mastoapi/test';
import { assertEquals } from '@std/assert';

import { userMiddleware } from './userMiddleware.ts';
import { ReadOnlySigner } from '../signers/ReadOnlySigner.ts';

Deno.test('no user 401', async () => {
  await using app = new TestApp();
  const response = await app.use(userMiddleware()).request('/');
  assertEquals(response.status, 401);
});

Deno.test('no user required false', async () => {
  await using app = new TestApp();

  app
    .use(userMiddleware({ required: false }))
    .get('/', (c) => c.text('ok'));

  const response = await app.request('/');

  assertEquals(response.status, 200);
});

Deno.test('unsupported signer 400', async () => {
  await using app = new TestApp();

  const user = {
    signer: new ReadOnlySigner('0461fcbecc4c3374439932d6b8f11269ccdb7cc973ad7a50ae362db135a474dd'),
    relay: app.var.relay,
  };

  app.user(user);

  const response = await app
    .use(userMiddleware({ enc: 'nip44' }))
    .use((c, next) => {
      c.var.user.signer.nip44.encrypt; // test that the type is set
      return next();
    })
    .request('/');

  assertEquals(response.status, 400);
});

Deno.test('with user 200', async () => {
  await using app = new TestApp();

  app.user();

  const response = await app
    .use(userMiddleware())
    .get('/', (c) => c.text('ok'))
    .request('/');

  assertEquals(response.status, 200);
});

Deno.test('user and role 403', async () => {
  await using app = new TestApp();

  app.user();

  const response = await app
    .use(userMiddleware({ role: 'admin' }))
    .request('/');

  assertEquals(response.status, 403);
});

Deno.test('admin role 200', async () => {
  await using app = new TestApp();
  const { conf, relay } = app.var;

  const user = app.user();

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
    .use(userMiddleware({ role: 'admin' }))
    .get('/', (c) => c.text('ok'))
    .request('/');

  assertEquals(response.status, 200);
});
