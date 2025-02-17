import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE OR REPLACE FUNCTION notify_nostr_event()
    RETURNS TRIGGER AS $$
    BEGIN
        IF OLD.id IS DISTINCT FROM NEW.id THEN
            PERFORM pg_notify('nostr_event', NEW.id::text);
        END IF;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`DROP TRIGGER IF EXISTS nostr_event_trigger ON nostr_events`.execute(db);

  await sql`
    CREATE TRIGGER nostr_event_trigger
    AFTER INSERT OR UPDATE ON nostr_events
    FOR EACH ROW EXECUTE FUNCTION notify_nostr_event()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE OR REPLACE FUNCTION notify_nostr_event()
    RETURNS TRIGGER AS $$
    BEGIN
        PERFORM pg_notify('nostr_event', NEW.id::text);

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`DROP TRIGGER IF EXISTS nostr_event_trigger ON nostr_events`.execute(db);

  await sql`
    CREATE TRIGGER nostr_event_trigger
    AFTER INSERT ON nostr_events
    FOR EACH ROW EXECUTE FUNCTION notify_nostr_event()
  `.execute(db);
}
