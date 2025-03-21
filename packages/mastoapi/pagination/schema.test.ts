import { assertEquals } from '@std/assert';

import { paginationSchema } from './schema.ts';

Deno.test('paginationSchema', () => {
  const pagination = paginationSchema().parse({
    limit: '10',
    offset: '20',
    max_id: '1',
    min_id: '2',
    since: '3',
    until: '4',
  });

  assertEquals(pagination, {
    limit: 10,
    offset: 20,
    max_id: '1',
    min_id: '2',
    since: 3,
    until: 4,
  });
});

Deno.test('paginationSchema with custom limit', () => {
  const pagination = paginationSchema({ limit: 100 }).parse({});
  assertEquals(pagination.limit, 100);
});
