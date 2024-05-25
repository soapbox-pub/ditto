import { assembleEvents } from '@/storages/hydrate.ts';
import { jsonlEvents } from '@/test.ts';

const testEvents = await jsonlEvents('fixtures/hydrated.jsonl');

Deno.bench('assembleEvents with home feed', (b) => {
  // The first 20 events in this file are my home feed.
  // The rest are events that would be hydrated by the store.
  const events = testEvents.slice(0, 20);

  b.start();

  assembleEvents(events, testEvents, { authors: [], events: [] });
});
