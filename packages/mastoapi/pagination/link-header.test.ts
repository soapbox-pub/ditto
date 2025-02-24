import { genEvent } from '@nostrify/nostrify/test';
import { assertEquals } from '@std/assert';

import { buildLinkHeader, buildListLinkHeader } from './link-header.ts';

Deno.test('buildLinkHeader', () => {
  const url = 'https://ditto.test/api/v1/events';

  const events = [
    genEvent({ created_at: 1 }),
    genEvent({ created_at: 2 }),
    genEvent({ created_at: 3 }),
  ];

  const link = buildLinkHeader(url, events);

  assertEquals(
    link?.toString(),
    '<https://ditto.test/api/v1/events?until=3>; rel="next", <https://ditto.test/api/v1/events?since=1>; rel="prev"',
  );
});

Deno.test('buildListLinkHeader', () => {
  const url = 'https://ditto.test/api/v1/tags';

  const params = { offset: 0, limit: 3 };

  const link = buildListLinkHeader(url, params);

  assertEquals(
    link?.toString(),
    '<https://ditto.test/api/v1/tags?offset=3&limit=3>; rel="next", <https://ditto.test/api/v1/tags?offset=0&limit=3>; rel="prev"',
  );
});
