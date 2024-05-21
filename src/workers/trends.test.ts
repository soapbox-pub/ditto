import { assertEquals } from '@std/assert';

import { TrendsWorker } from './trends.ts';

await TrendsWorker.open(':memory:');

const p8 = (pubkey8: string) => `${pubkey8}00000000000000000000000000000000000000000000000000000000`;

Deno.test('getTrendingTags', async () => {
  await TrendsWorker.addTagUsages(p8('00000000'), ['ditto', 'hello', 'yolo']);
  await TrendsWorker.addTagUsages(p8('00000000'), ['hello']);
  await TrendsWorker.addTagUsages(p8('00000001'), ['Ditto', 'hello']);
  await TrendsWorker.addTagUsages(p8('00000010'), ['DITTO']);

  const result = await TrendsWorker.getTrendingTags({
    since: new Date('1999-01-01T00:00:00'),
    until: new Date('2999-01-01T00:00:00'),
    threshold: 1,
  });

  const expected = [
    { tag: 'ditto', accounts: 3, uses: 3 },
    { tag: 'hello', accounts: 2, uses: 3 },
    { tag: 'yolo', accounts: 1, uses: 1 },
  ];

  assertEquals(result, expected);

  await TrendsWorker.cleanupTagUsages(new Date('2999-01-01T00:00:00'));
});
