import { Memorelay } from '@/storages/memorelay.ts';

/** In-memory data store for events using microfilters. */
const memorelay = new Memorelay({
  max: 3000,
  maxEntrySize: 5000,
  sizeCalculation: (event) => JSON.stringify(event).length,
});

export { memorelay };
