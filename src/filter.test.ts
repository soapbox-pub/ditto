import { assertEquals } from '@std/assert';

import event0 from '~/fixtures/events/event-0.json' with { type: 'json' };
import event1 from '~/fixtures/events/event-1.json' with { type: 'json' };

import { eventToMicroFilter, getFilterId, getFilterLimit, getMicroFilters, isMicrofilter } from './filter.ts';

Deno.test('getMicroFilters', () => {
  const event = event0;
  const microfilters = getMicroFilters(event);
  assertEquals(microfilters.length, 2);
  assertEquals(microfilters[0], { authors: [event.pubkey], kinds: [0] });
  assertEquals(microfilters[1], { ids: [event.id] });
});

Deno.test('eventToMicroFilter', () => {
  assertEquals(eventToMicroFilter(event0), { authors: [event0.pubkey], kinds: [0] });
  assertEquals(eventToMicroFilter(event1), { ids: [event1.id] });
});

Deno.test('isMicrofilter', () => {
  assertEquals(isMicrofilter({ ids: [event0.id] }), true);
  assertEquals(isMicrofilter({ authors: [event0.pubkey], kinds: [0] }), true);
  assertEquals(isMicrofilter({ ids: [event0.id], authors: [event0.pubkey], kinds: [0] }), false);
});

Deno.test('getFilterId', () => {
  assertEquals(
    getFilterId({ ids: [event0.id] }),
    '{"ids":["63d38c9b483d2d98a46382eadefd272e0e4bdb106a5b6eddb400c4e76f693d35"]}',
  );
  assertEquals(
    getFilterId({ authors: [event0.pubkey], kinds: [0] }),
    '{"authors":["79c2cae114ea28a981e7559b4fe7854a473521a8d22a66bbab9fa248eb820ff6"],"kinds":[0]}',
  );
});

Deno.test('getFilterLimit', () => {
  assertEquals(getFilterLimit({ ids: [event0.id] }), 1);
  assertEquals(getFilterLimit({ ids: [event0.id], limit: 2 }), 1);
  assertEquals(getFilterLimit({ ids: [event0.id], limit: 0 }), 0);
  assertEquals(getFilterLimit({ ids: [event0.id], limit: -1 }), 0);
  assertEquals(getFilterLimit({ kinds: [0], authors: [event0.pubkey] }), 1);
  assertEquals(getFilterLimit({ kinds: [1], authors: [event0.pubkey] }), Infinity);
  assertEquals(getFilterLimit({}), Infinity);
});
