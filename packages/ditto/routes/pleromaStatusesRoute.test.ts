import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';
import { TestApp } from '@ditto/mastoapi/test';
import { genEvent, MockRelay } from '@nostrify/nostrify/test';
import { assertEquals } from '@std/assert';

import { DittoPgStore } from '@/storages/DittoPgStore.ts';
import { DittoRelayStore } from '@/storages/DittoRelayStore.ts';

import route from './pleromaStatusesRoute.ts';

Deno.test('Emoji reactions', async (t) => {
  await using test = createTestApp();
  const { relay } = test.var;

  test.user();

  const note = genEvent({ kind: 1 });
  await relay.event(note);

  await t.step('PUT /:id/reactions/:emoji', async () => {
    const response = await test.api.put(`/${note.id}/reactions/🚀`);
    const json = await response.json();

    assertEquals(response.status, 200);
    assertEquals(json.pleroma.emoji_reactions, [{ name: '🚀', me: true, count: 1 }]);
  });

  await t.step('GET /:id/reactions', async () => {
    const response = await test.api.get(`/${note.id}/reactions`);
    const json = await response.json();
    const [{ accounts }] = json;

    assertEquals(response.status, 200);
    assertEquals(json, [{ name: '🚀', me: true, count: 1, accounts }]);
  });

  await t.step('DELETE /:id/reactions/:emoji', async () => {
    const response = await test.api.delete(`/${note.id}/reactions/🚀`);
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
  const store = new DittoPgStore({ conf, db });
  const relay = new DittoRelayStore({ conf, db, pool, relay: store });

  return new TestApp(route, { conf, db, relay });
}
