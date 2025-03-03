import { TestApp } from '@ditto/mastoapi/test';
import { assertEquals } from '@std/assert';
import { nip19 } from 'nostr-tools';

import route from './pleromaAdminPermissionGroupsRoute.ts';

Deno.test('POST /admin returns 403 if user is not an admin', async () => {
  await using app = new TestApp(route);

  app.user();

  const response = await app.api.post('/admin', { nicknames: ['alex@ditto.pub'] });

  assertEquals(response.status, 403);
});

Deno.test('POST /admin promotes to admin', async () => {
  await using app = new TestApp(route);
  const { conf, relay } = app.var;

  await app.admin();

  const pawn = app.createUser();
  const pubkey = await pawn.signer.getPublicKey();

  const response = await app.api.post('/admin', { nicknames: [nip19.npubEncode(pubkey)] });
  const json = await response.json();

  assertEquals(response.status, 200);
  assertEquals(json, { is_admin: true });

  const [event] = await relay.query([{ kinds: [30382], authors: [await conf.signer.getPublicKey()], '#d': [pubkey] }]);

  assertEquals(event.tags, [['d', pubkey], ['n', 'admin']]);
});

Deno.test('POST /moderator promotes to moderator', async () => {
  await using app = new TestApp(route);
  const { conf, relay } = app.var;

  await app.admin();

  const pawn = app.createUser();
  const pubkey = await pawn.signer.getPublicKey();

  const response = await app.api.post('/moderator', { nicknames: [nip19.npubEncode(pubkey)] });
  const json = await response.json();

  assertEquals(response.status, 200);
  assertEquals(json, { is_moderator: true });

  const [event] = await relay.query([{ kinds: [30382], authors: [await conf.signer.getPublicKey()], '#d': [pubkey] }]);

  assertEquals(event.tags, [['d', pubkey], ['n', 'moderator']]);
});

Deno.test('POST /:group with an invalid group returns 422', async () => {
  await using app = new TestApp(route);

  await app.admin();

  const pawn = app.createUser();
  const pubkey = await pawn.signer.getPublicKey();

  const response = await app.api.post('/yolo', { nicknames: [nip19.npubEncode(pubkey)] });

  assertEquals(response.status, 422);
});
