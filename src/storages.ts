import { Conf } from '@/config.ts';
import { db } from '@/db.ts';
import { EventsDB } from '@/storages/events-db.ts';
import { Memorelay } from '@/storages/memorelay.ts';
import { SearchStore } from '@/storages/search-store.ts';

/** SQLite database to store events this Ditto server cares about. */
const eventsDB = new EventsDB(db);

/** In-memory data store for cached events. */
const memorelay = new Memorelay({ max: 3000 });

/** Storage to use for remote search. */
const searchStore = new SearchStore({
  relay: Conf.searchRelay,
  fallback: eventsDB,
});

export { eventsDB, memorelay, searchStore };
