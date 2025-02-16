import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS nostr_event_trigger ON nostr_events`.execute(db);

  await sql`
    CREATE TRIGGER nostr_event_trigger
    AFTER INSERT ON nostr_events
    FOR EACH ROW EXECUTE FUNCTION notify_nostr_event()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS nostr_event_trigger ON nostr_events`.execute(db);

  await sql`
    CREATE TRIGGER nostr_event_trigger
    AFTER INSERT OR UPDATE ON nostr_events
    FOR EACH ROW EXECUTE FUNCTION notify_nostr_event()
  `.execute(db);
}
