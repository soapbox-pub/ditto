import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';
import { TestApp } from '@ditto/mastoapi/test';
import { genEvent, MockRelay } from '@nostrify/nostrify/test';
import { assertEquals } from '@std/assert';

import { DittoPgStore } from '@/storages/DittoPgStore.ts';
import { DittoRelayStore } from '@/storages/DittoRelayStore.ts';

import route from './pleromaStatusesRoute.ts';

import type { MastodonStatus } from '@ditto/mastoapi/types';

Deno.test('Emoji reactions', async (t) => {
  await using test = createTestApp();
  const { relay } = test.var;

  const mario = test.createUser();
  const luigi = test.createUser();

  const note = genEvent({ kind: 1 });
  await relay.event(note);

  await relay.event(genEvent({ kind: 10030, tags: [['emoji', 'ditto', 'https://ditto.pub/favicon.ico']] }, luigi.sk));

  await t.step('PUT /:id/reactions/:emoji', async () => {
    test.user(mario);

    const response = await test.api.put(`/${note.id}/reactions/🚀`);
    const json = await response.json();

    assertEquals(response.status, 200);
    assertEquals(json.pleroma.emoji_reactions, [{ name: '🚀', me: true, count: 1 }]);
  });

  await t.step('PUT /:id/reactions/:emoji (custom emoji)', async () => {
    test.user(luigi);

    const response = await test.api.put(`/${note.id}/reactions/:ditto:`);
    const json: MastodonStatus = await response.json();

    assertEquals(
      json.pleroma.emoji_reactions.sort((a, b) => a.name.localeCompare(b.name)),
      [
        { name: '🚀', me: false, count: 1 },
        { name: 'ditto', me: true, count: 1, url: 'https://ditto.pub/favicon.ico' },
      ],
    );
  });

  await t.step('GET /:id/reactions', async () => {
    test.user(mario);

    const response = await test.api.get(`/${note.id}/reactions`);
    const json = await response.json();

    (json as MastodonStatus['pleroma']['emoji_reactions']).sort((a, b) => a.name.localeCompare(b.name));

    const [
      { accounts: [marioAccount] },
      { accounts: [luigiAccount] },
    ] = json;

    assertEquals(response.status, 200);

    assertEquals(json, [
      { name: '🚀', me: true, count: 1, accounts: [marioAccount] },
      { name: 'ditto', me: false, count: 1, accounts: [luigiAccount], url: 'https://ditto.pub/favicon.ico' },
    ]);
  });

  await t.step('DELETE /:id/reactions/:emoji', async () => {
    test.user(mario);

    const response = await test.api.delete(`/${note.id}/reactions/🚀`);
    const json = await response.json();

    assertEquals(response.status, 200);

    assertEquals(json.pleroma.emoji_reactions, [
      { name: 'ditto', me: false, count: 1, url: 'https://ditto.pub/favicon.ico' },
    ]);
  });

  await t.step('DELETE /:id/reactions/:emoji (custom emoji)', async () => {
    test.user(luigi);

    const response = await test.api.delete(`/${note.id}/reactions/:ditto:`);
    const json = await response.json();

    assertEquals(response.status, 200);
    assertEquals(json.pleroma.emoji_reactions, []);
  });
});

// TODO: modify `TestApp` itself to avoid this boilerplate.
function createTestApp(): TestApp {
  const conf = new DittoConf(Deno.env);
  const db = new DittoPolyPg(conf.databaseUrl);
  const pool = new MockRelay();
  const store = new DittoPgStore({ conf, db, notify: false });
  const relay = new DittoRelayStore({ conf, db, pool, relay: store });

  return new TestApp(route, { conf, db, relay });
}
