import { db } from '@/db.ts';
import { EventsDB } from '@/storages/events-db.ts';

const eventsDB = new EventsDB(db);

export { eventsDB };
