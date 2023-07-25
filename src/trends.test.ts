import { assertEquals } from '@/deps-test.ts';
import { Sqlite } from '@/deps.ts';

import { TrendsDB } from './trends.ts';

const db = new Sqlite(':memory:');
const trends = new TrendsDB(db);

const p8 = (pubkey8: string) => `${pubkey8}00000000000000000000000000000000000000000000000000000000`;

Deno.test('getTrendingTags', () => {
  trends.addTagUsages(p8('00000000'), ['ditto', 'hello', 'yolo']);
  trends.addTagUsages(p8('00000001'), ['Ditto', 'hello']);
  trends.addTagUsages(p8('00000010'), ['DITTO']);

  const result = trends.getTrendingTags(
    new Date('1999-01-01T00:00:00'),
    new Date('2999-01-01T00:00:00'),
  );

  assertEquals(result, ['ditto', 'hello', 'yolo']);

  trends.cleanupTagUsages(new Date('2999-01-01T00:00:00'));
});
