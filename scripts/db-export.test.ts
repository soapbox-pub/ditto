import { assertEquals, assertThrows } from '@std/assert';

import { buildFilter } from './db-export.ts';

Deno.test('buildFilter should return an empty filter when no arguments are provided', () => {
  const filter = buildFilter({});
  assertEquals(Object.keys(filter).length, 0);
});

Deno.test('buildFilter should correctly handle valid authors', () => {
  const filter = buildFilter({
    authors: ['a'.repeat(64)],
  });

  assertEquals(filter.authors, ['a'.repeat(64)]);
});

Deno.test('buildFilter throws on invalid author pubkey', () => {
  assertThrows(
    () => {
      buildFilter({
        authors: ['invalid_pubkey'],
      });
    },
    Error,
    'ERROR: Invalid pubkey invalid_pubkey supplied.',
  );
});

Deno.test('buildFilter should correctly handle valid ids', () => {
  const filter = buildFilter({
    ids: ['b'.repeat(64)],
  });

  assertEquals(filter.ids, ['b'.repeat(64)]);
});

Deno.test('buildFilter should throw on invalid event IDs', () => {
  assertThrows(
    () => {
      buildFilter({
        ids: ['invalid_id'],
      });
    },
    Error,
    'ERROR: Invalid event ID invalid_id supplied.',
  );
});

Deno.test('buildFilter should correctly handle tag shortcuts', () => {
  const filter = buildFilter({
    d: 'value1',
    e: 'a'.repeat(64),
    p: 'b'.repeat(64),
  });

  assertEquals(filter['#d'], ['value1']);
  assertEquals(filter['#e'], ['a'.repeat(64)]);
  assertEquals(filter['#p'], ['b'.repeat(64)]);
});

Deno.test('buildFilter should correctly handle since and until args', () => {
  const filter = buildFilter({
    since: 1000,
    until: 2000,
  });

  assertEquals(filter.since, 1000);
  assertEquals(filter.until, 2000);
});

Deno.test('buildFilter should correctly handle search field', () => {
  const filter = buildFilter({
    search: 'search_term',
  });

  assertEquals(filter.search, 'search_term');
});

Deno.test('buildFilter should correctly handle tag k-v pairs', () => {
  const filter = buildFilter({
    tags: ['tag1=value1', 'tag2=value2'],
  });

  assertEquals(filter['#tag1'], ['value1']);
  assertEquals(filter['#tag2'], ['value2']);
});

Deno.test('buildFilter should correctly handle limit specifier', () => {
  const filter = buildFilter({
    limit: 10,
  });

  assertEquals(filter.limit, 10);
});
