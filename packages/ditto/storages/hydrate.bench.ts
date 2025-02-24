import { jsonlEvents } from '@nostrify/nostrify/test';

import { assembleEvents } from '@/storages/hydrate.ts';

const testEvents = await jsonlEvents('fixtures/hydrated.jsonl');
const testStats = JSON.parse(await Deno.readTextFile('fixtures/stats.json'));

// The first 20 events in this file are my home feed.
// The rest are events that would be hydrated by the store.
const events = testEvents.slice(0, 20);

Deno.bench('assembleEvents with home feed', () => {
  assembleEvents('', events, testEvents, testStats);
});
