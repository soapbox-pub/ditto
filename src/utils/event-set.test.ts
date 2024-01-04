import { assertEquals } from '@/deps-test.ts';

import { EventSet } from './event-set.ts';

Deno.test('EventSet', () => {
  const set = new EventSet();
  assertEquals(set.size, 0);

  const event = { id: '1', kind: 0, pubkey: 'abc', content: '', created_at: 0, sig: '', tags: [] };
  set.add(event);
  assertEquals(set.size, 1);
  assertEquals(set.has(event), true);

  set.add(event);
  assertEquals(set.size, 1);
  assertEquals(set.has(event), true);

  set.delete(event);
  assertEquals(set.size, 0);
  assertEquals(set.has(event), false);

  set.delete(event);
  assertEquals(set.size, 0);
  assertEquals(set.has(event), false);

  set.add(event);
  assertEquals(set.size, 1);
  assertEquals(set.has(event), true);

  set.clear();
  assertEquals(set.size, 0);
  assertEquals(set.has(event), false);
});

Deno.test('EventSet.add (replaceable)', () => {
  const event0 = { id: '1', kind: 0, pubkey: 'abc', content: '', created_at: 0, sig: '', tags: [] };
  const event1 = { id: '2', kind: 0, pubkey: 'abc', content: '', created_at: 1, sig: '', tags: [] };
  const event2 = { id: '3', kind: 0, pubkey: 'abc', content: '', created_at: 2, sig: '', tags: [] };

  const set = new EventSet();
  set.add(event0);
  assertEquals(set.size, 1);
  assertEquals(set.has(event0), true);

  set.add(event1);
  assertEquals(set.size, 1);
  assertEquals(set.has(event0), false);
  assertEquals(set.has(event1), true);

  set.add(event2);
  assertEquals(set.size, 1);
  assertEquals(set.has(event0), false);
  assertEquals(set.has(event1), false);
  assertEquals(set.has(event2), true);
});

Deno.test('EventSet.add (parameterized)', () => {
  const event0 = { id: '1', kind: 30000, pubkey: 'abc', content: '', created_at: 0, sig: '', tags: [['d', 'a']] };
  const event1 = { id: '2', kind: 30000, pubkey: 'abc', content: '', created_at: 1, sig: '', tags: [['d', 'a']] };
  const event2 = { id: '3', kind: 30000, pubkey: 'abc', content: '', created_at: 2, sig: '', tags: [['d', 'a']] };

  const set = new EventSet();
  set.add(event0);
  assertEquals(set.size, 1);
  assertEquals(set.has(event0), true);

  set.add(event1);
  assertEquals(set.size, 1);
  assertEquals(set.has(event0), false);
  assertEquals(set.has(event1), true);

  set.add(event2);
  assertEquals(set.size, 1);
  assertEquals(set.has(event0), false);
  assertEquals(set.has(event1), false);
  assertEquals(set.has(event2), true);
});

Deno.test('EventSet.eventReplaces', () => {
  const event0 = { id: '1', kind: 0, pubkey: 'abc', content: '', created_at: 0, sig: '', tags: [] };
  const event1 = { id: '2', kind: 0, pubkey: 'abc', content: '', created_at: 1, sig: '', tags: [] };
  const event2 = { id: '3', kind: 0, pubkey: 'abc', content: '', created_at: 2, sig: '', tags: [] };
  const event3 = { id: '4', kind: 0, pubkey: 'def', content: '', created_at: 0, sig: '', tags: [] };

  assertEquals(EventSet.eventReplaces(event1, event0), true);
  assertEquals(EventSet.eventReplaces(event2, event0), true);
  assertEquals(EventSet.eventReplaces(event2, event1), true);

  assertEquals(EventSet.eventReplaces(event0, event1), false);
  assertEquals(EventSet.eventReplaces(event0, event2), false);
  assertEquals(EventSet.eventReplaces(event1, event2), false);

  assertEquals(EventSet.eventReplaces(event3, event1), false);
  assertEquals(EventSet.eventReplaces(event1, event3), false);
});

Deno.test('EventSet.eventReplaces (parameterized)', () => {
  const event0 = { id: '1', kind: 30000, pubkey: 'abc', content: '', created_at: 0, sig: '', tags: [['d', 'a']] };
  const event1 = { id: '2', kind: 30000, pubkey: 'abc', content: '', created_at: 1, sig: '', tags: [['d', 'a']] };
  const event2 = { id: '3', kind: 30000, pubkey: 'abc', content: '', created_at: 2, sig: '', tags: [['d', 'a']] };

  assertEquals(EventSet.eventReplaces(event1, event0), true);
  assertEquals(EventSet.eventReplaces(event2, event0), true);
  assertEquals(EventSet.eventReplaces(event2, event1), true);

  assertEquals(EventSet.eventReplaces(event0, event1), false);
  assertEquals(EventSet.eventReplaces(event0, event2), false);
  assertEquals(EventSet.eventReplaces(event1, event2), false);
});
