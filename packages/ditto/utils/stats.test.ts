import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';
import { NPostgres } from '@nostrify/db';
import { genEvent } from '@nostrify/nostrify/test';
import { assertEquals } from '@std/assert';
import { sql } from 'kysely';
import { generateSecretKey, getPublicKey } from 'nostr-tools';

import { countAuthorStats, getAuthorStats, getEventStats, getFollowDiff, updateStats } from '@/utils/stats.ts';

Deno.test('updateStats with kind 1 increments notes count', async () => {
  await using test = await setupTest();

  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  await updateStats({ ...test, event: genEvent({ kind: 1 }, sk) });

  const stats = await getAuthorStats(test.kysely, pubkey);

  assertEquals(stats!.notes_count, 1);
});

Deno.test('updateStats with kind 1 increments replies count', async () => {
  await using test = await setupTest();
  const { kysely, relay } = test;

  const sk = generateSecretKey();

  const note = genEvent({ kind: 1 }, sk);
  await updateStats({ ...test, event: note });
  await relay.event(note);

  const reply = genEvent({ kind: 1, tags: [['e', note.id]] }, sk);
  await updateStats({ ...test, event: reply });
  await relay.event(reply);

  const stats = await getEventStats(kysely, note.id);

  assertEquals(stats!.replies_count, 1);
});

Deno.test('updateStats with kind 5 decrements notes count', async () => {
  await using test = await setupTest();
  const { kysely, relay } = test;

  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  const create = genEvent({ kind: 1 }, sk);
  const remove = genEvent({ kind: 5, tags: [['e', create.id]] }, sk);

  await updateStats({ ...test, event: create });
  assertEquals((await getAuthorStats(kysely, pubkey))!.notes_count, 1);
  await relay.event(create);

  await updateStats({ ...test, event: remove });
  assertEquals((await getAuthorStats(kysely, pubkey))!.notes_count, 0);
  await relay.event(remove);
});

Deno.test('updateStats with kind 3 increments followers count', async () => {
  await using test = await setupTest();
  const { kysely } = test;

  await updateStats({ ...test, event: genEvent({ kind: 3, tags: [['p', 'alex']] }) });
  await updateStats({ ...test, event: genEvent({ kind: 3, tags: [['p', 'alex']] }) });
  await updateStats({ ...test, event: genEvent({ kind: 3, tags: [['p', 'alex']] }) });

  const stats = await getAuthorStats(kysely, 'alex');

  assertEquals(stats!.followers_count, 3);
});

Deno.test('updateStats with kind 3 decrements followers count', async () => {
  await using test = await setupTest();
  const { kysely, relay } = test;

  const sk = generateSecretKey();
  const follow = genEvent({ kind: 3, tags: [['p', 'alex']], created_at: 0 }, sk);
  const remove = genEvent({ kind: 3, tags: [], created_at: 1 }, sk);

  await updateStats({ ...test, event: follow });
  assertEquals((await getAuthorStats(kysely, 'alex'))!.followers_count, 1);
  await relay.event(follow);

  await updateStats({ ...test, event: remove });
  assertEquals((await getAuthorStats(kysely, 'alex'))!.followers_count, 0);
  await relay.event(remove);
});

Deno.test('getFollowDiff returns added and removed followers', () => {
  const prev = genEvent({ tags: [['p', 'alex'], ['p', 'bob']] });
  const next = genEvent({ tags: [['p', 'alex'], ['p', 'carol']] });

  const { added, removed } = getFollowDiff(next.tags, prev.tags);

  assertEquals(added, new Set(['carol']));
  assertEquals(removed, new Set(['bob']));
});

Deno.test('updateStats with kind 6 increments reposts count', async () => {
  await using test = await setupTest();
  const { kysely, relay } = test;

  const note = genEvent({ kind: 1 });
  await updateStats({ ...test, event: note });
  await relay.event(note);

  const repost = genEvent({ kind: 6, tags: [['e', note.id]] });
  await updateStats({ ...test, event: repost });
  await relay.event(repost);

  const stats = await getEventStats(kysely, note.id);

  assertEquals(stats!.reposts_count, 1);
});

Deno.test('updateStats with kind 5 decrements reposts count', async () => {
  await using test = await setupTest();
  const { kysely, relay } = test;

  const note = genEvent({ kind: 1 });
  await updateStats({ ...test, event: note });
  await relay.event(note);

  const sk = generateSecretKey();
  const repost = genEvent({ kind: 6, tags: [['e', note.id]] }, sk);
  await updateStats({ ...test, event: repost });
  await relay.event(repost);

  await updateStats({ ...test, event: genEvent({ kind: 5, tags: [['e', repost.id]] }, sk) });

  const stats = await getEventStats(kysely, note.id);

  assertEquals(stats!.reposts_count, 0);
});

Deno.test('updateStats with kind 7 increments reactions count', async () => {
  await using test = await setupTest();
  const { kysely, relay } = test;

  const note = genEvent({ kind: 1 });
  await relay.event(note);

  await updateStats({ ...test, event: genEvent({ kind: 7, content: '+', tags: [['e', note.id]] }) });
  await updateStats({ ...test, event: genEvent({ kind: 7, content: '😂', tags: [['e', note.id]] }) });

  await updateStats({
    ...test,
    event: genEvent({
      kind: 7,
      content: ':ditto:',
      tags: [['e', note.id], ['emoji', 'ditto', 'https://ditto.pub/favicon.ico']],
    }),
  });

  const stats = await getEventStats(kysely, note.id);

  assertEquals(stats!.reactions, JSON.stringify({ '+': 1, '😂': 1, 'ditto:https://ditto.pub/favicon.ico': 1 }));
  assertEquals(stats!.reactions_count, 3);
});

Deno.test('updateStats with kind 9321 increments zaps_amount_cashu count', async () => {
  await using test = await setupTest();
  const { kysely, relay } = test;

  const note = genEvent({ kind: 1 });
  await relay.event(note);

  await updateStats({
    ...test,
    event: genEvent({
      kind: 9321,
      content: 'Do you love me?',
      tags: [
        ['e', note.id],
        [
          'proof',
          '{"id":"004f7adf2a04356c","amount":29,"secret":"6780378b186cf7ada639ce4807803ad5e4a71217688430512f35074f9bca99c0","C":"03f0dd8df04427c8c53e4ae9ce8eb91c4880203d6236d1d745c788a5d7a47aaff3","dleq":{"e":"bd22fcdb7ede1edb52b9b8c6e1194939112928e7b4fc0176325e7671fb2bd351","s":"a9ad015571a0e538d62966a16d2facf806fb956c746a3dfa41fa689486431c67","r":"b283980e30bf5a31a45e5e296e93ae9f20bf3a140c884b3b4cd952dbecc521df"}}',
        ],
      ],
    }),
  });

  await updateStats({
    ...test,
    event: genEvent({
      kind: 9321,
      content: 'Ultimatum',
      tags: [
        ['e', note.id],
        [
          'proof',
          '{"id":"004f7adf2a04356c","amount":100,"secret":"6780378b186cf7ada639ce4807803ad5e4a71217688430512f35074f9bca99c0","C":"03f0dd8df04427c8c53e4ae9ce8eb91c4880203d6236d1d745c788a5d7a47aaff3","dleq":{"e":"bd22fcdb7ede1edb52b9b8c6e1194939112928e7b4fc0176325e7671fb2bd351","s":"a9ad015571a0e538d62966a16d2facf806fb956c746a3dfa41fa689486431c67","r":"b283980e30bf5a31a45e5e296e93ae9f20bf3a140c884b3b4cd952dbecc521df"}}',
        ],
      ],
    }),
  });

  const stats = await getEventStats(kysely, note.id);

  assertEquals(stats!.zaps_amount_cashu, 129);
});

Deno.test('updateStats with kind 5 decrements reactions count', async () => {
  await using test = await setupTest();
  const { kysely, relay } = test;

  const note = genEvent({ kind: 1 });
  await updateStats({ ...test, event: note });
  await relay.event(note);

  const sk = generateSecretKey();
  const reaction = genEvent({ kind: 7, content: '+', tags: [['e', note.id]] }, sk);
  await updateStats({ ...test, event: reaction });
  await relay.event(reaction);

  await updateStats({ ...test, event: genEvent({ kind: 5, tags: [['e', reaction.id]] }, sk) });

  const stats = await getEventStats(kysely, note.id);

  assertEquals(stats!.reactions, JSON.stringify({}));
});

Deno.test('countAuthorStats counts author stats from the database', async () => {
  await using test = await setupTest();
  const { kysely, relay } = test;

  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  await relay.event(genEvent({ kind: 1, content: 'hello' }, sk));
  await relay.event(genEvent({ kind: 1, content: 'yolo' }, sk));
  await relay.event(genEvent({ kind: 3, tags: [['p', pubkey]] }));

  await kysely.insertInto('author_stats').values({
    pubkey,
    search: 'Yolo Lolo',
    notes_count: 0,
    followers_count: 0,
    following_count: 0,
  }).onConflict((oc) => oc.column('pubkey').doUpdateSet({ 'search': 'baka' }))
    .execute();

  const stats = await countAuthorStats({ ...test, kysely, pubkey });

  assertEquals(stats!.notes_count, 2);
  assertEquals(stats!.followers_count, 1);
});

async function setupTest() {
  const conf = new DittoConf(Deno.env);

  const db = new DittoPolyPg(conf.databaseUrl);
  await db.migrate();

  const { kysely } = db;
  const relay = new NPostgres(db.kysely);

  return {
    conf,
    relay,
    kysely,
    [Symbol.asyncDispose]: async () => {
      await sql`truncate table event_stats cascade`.execute(kysely);
      await sql`truncate table author_stats cascade`.execute(kysely);
      await db[Symbol.asyncDispose]();
    },
  };
}
