import { db } from '@/db.ts';
import { EventsDB } from '@/storages/events-db.ts';
import { Memorelay } from '@/storages/memorelay.ts';

/** SQLite database to store events this Ditto server cares about. */
const eventsDB = new EventsDB(db);

/** In-memory data store for cached events. */
const memorelay = new Memorelay({ max: 3000 });

export { eventsDB, memorelay };
