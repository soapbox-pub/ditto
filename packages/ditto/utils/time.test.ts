import { assertEquals } from '@std/assert';

import { generateDateRange } from './time.ts';

Deno.test('generateDateRange', () => {
  const since = new Date('2023-07-03T16:30:00.000Z');
  const until = new Date('2023-07-07T09:01:00.000Z');

  const expected = [
    new Date('2023-07-03T00:00:00.000Z'),
    new Date('2023-07-04T00:00:00.000Z'),
    new Date('2023-07-05T00:00:00.000Z'),
    new Date('2023-07-06T00:00:00.000Z'),
    new Date('2023-07-07T00:00:00.000Z'),
  ];

  const result = generateDateRange(since, until);

  assertEquals(
    result.map((d) => d.getTime()),
    expected.map((d) => d.getTime()),
  );
});
