import { assertEquals } from '@std/assert';
import { generateSecretKey, getPublicKey } from 'nostr-tools';

import { genEvent, getTestDB } from '@/test.ts';
import { countAuthorStats, getAuthorStats, getEventStats, getFollowDiff, updateStats } from '@/utils/stats.ts';

Deno.test('updateStats with kind 1 increments notes count', async () => {
  await using db = await getTestDB();

  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  await updateStats({ ...db, event: genEvent({ kind: 1 }, sk) });

  const stats = await getAuthorStats(db.kysely, pubkey);

  assertEquals(stats!.notes_count, 1);
});

Deno.test('updateStats with kind 1 increments replies count', async () => {
  await using db = await getTestDB();

  const sk = generateSecretKey();

  const note = genEvent({ kind: 1 }, sk);
  await updateStats({ ...db, event: note });
  await db.store.event(note);

  const reply = genEvent({ kind: 1, tags: [['e', note.id]] }, sk);
  await updateStats({ ...db, event: reply });
  await db.store.event(reply);

  const stats = await getEventStats(db.kysely, note.id);

  assertEquals(stats!.replies_count, 1);
});

Deno.test('updateStats with kind 5 decrements notes count', async () => {
  await using db = await getTestDB();

  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  const create = genEvent({ kind: 1 }, sk);
  const remove = genEvent({ kind: 5, tags: [['e', create.id]] }, sk);

  await updateStats({ ...db, event: create });
  assertEquals((await getAuthorStats(db.kysely, pubkey))!.notes_count, 1);
  await db.store.event(create);

  await updateStats({ ...db, event: remove });
  assertEquals((await getAuthorStats(db.kysely, pubkey))!.notes_count, 0);
  await db.store.event(remove);
});

Deno.test('updateStats with kind 3 increments followers count', async () => {
  await using db = await getTestDB();

  await updateStats({ ...db, event: genEvent({ kind: 3, tags: [['p', 'alex']] }) });
  await updateStats({ ...db, event: genEvent({ kind: 3, tags: [['p', 'alex']] }) });
  await updateStats({ ...db, event: genEvent({ kind: 3, tags: [['p', 'alex']] }) });

  const stats = await getAuthorStats(db.kysely, 'alex');

  assertEquals(stats!.followers_count, 3);
});

Deno.test('updateStats with kind 3 decrements followers count', async () => {
  await using db = await getTestDB();

  const sk = generateSecretKey();
  const follow = genEvent({ kind: 3, tags: [['p', 'alex']], created_at: 0 }, sk);
  const remove = genEvent({ kind: 3, tags: [], created_at: 1 }, sk);

  await updateStats({ ...db, event: follow });
  assertEquals((await getAuthorStats(db.kysely, 'alex'))!.followers_count, 1);
  await db.store.event(follow);

  await updateStats({ ...db, event: remove });
  assertEquals((await getAuthorStats(db.kysely, 'alex'))!.followers_count, 0);
  await db.store.event(remove);
});

Deno.test('getFollowDiff returns added and removed followers', () => {
  const prev = genEvent({ tags: [['p', 'alex'], ['p', 'bob']] });
  const next = genEvent({ tags: [['p', 'alex'], ['p', 'carol']] });

  const { added, removed } = getFollowDiff(next.tags, prev.tags);

  assertEquals(added, new Set(['carol']));
  assertEquals(removed, new Set(['bob']));
});

Deno.test('updateStats with kind 6 increments reposts count', async () => {
  await using db = await getTestDB();

  const note = genEvent({ kind: 1 });
  await updateStats({ ...db, event: note });
  await db.store.event(note);

  const repost = genEvent({ kind: 6, tags: [['e', note.id]] });
  await updateStats({ ...db, event: repost });
  await db.store.event(repost);

  const stats = await getEventStats(db.kysely, note.id);

  assertEquals(stats!.reposts_count, 1);
});

Deno.test('updateStats with kind 5 decrements reposts count', async () => {
  await using db = await getTestDB();

  const note = genEvent({ kind: 1 });
  await updateStats({ ...db, event: note });
  await db.store.event(note);

  const sk = generateSecretKey();
  const repost = genEvent({ kind: 6, tags: [['e', note.id]] }, sk);
  await updateStats({ ...db, event: repost });
  await db.store.event(repost);

  await updateStats({ ...db, event: genEvent({ kind: 5, tags: [['e', repost.id]] }, sk) });

  const stats = await getEventStats(db.kysely, note.id);

  assertEquals(stats!.reposts_count, 0);
});

Deno.test('updateStats with kind 7 increments reactions count', async () => {
  await using db = await getTestDB();

  const note = genEvent({ kind: 1 });
  await updateStats({ ...db, event: note });
  await db.store.event(note);

  await updateStats({ ...db, event: genEvent({ kind: 7, content: '+', tags: [['e', note.id]] }) });
  await updateStats({ ...db, event: genEvent({ kind: 7, content: '😂', tags: [['e', note.id]] }) });

  const stats = await getEventStats(db.kysely, note.id);

  assertEquals(stats!.reactions, JSON.stringify({ '+': 1, '😂': 1 }));
  assertEquals(stats!.reactions_count, 2);
});

Deno.test('updateStats with kind 5 decrements reactions count', async () => {
  await using db = await getTestDB();

  const note = genEvent({ kind: 1 });
  await updateStats({ ...db, event: note });
  await db.store.event(note);

  const sk = generateSecretKey();
  const reaction = genEvent({ kind: 7, content: '+', tags: [['e', note.id]] }, sk);
  await updateStats({ ...db, event: reaction });
  await db.store.event(reaction);

  await updateStats({ ...db, event: genEvent({ kind: 5, tags: [['e', reaction.id]] }, sk) });

  const stats = await getEventStats(db.kysely, note.id);

  assertEquals(stats!.reactions, JSON.stringify({}));
});

Deno.test('countAuthorStats counts author stats from the database', async () => {
  await using db = await getTestDB();

  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);

  await db.store.event(genEvent({ kind: 1, content: 'hello' }, sk));
  await db.store.event(genEvent({ kind: 1, content: 'yolo' }, sk));
  await db.store.event(genEvent({ kind: 3, tags: [['p', pubkey]] }));

  const stats = await countAuthorStats(db.store, pubkey);

  assertEquals(stats!.notes_count, 2);
  assertEquals(stats!.followers_count, 1);
});
