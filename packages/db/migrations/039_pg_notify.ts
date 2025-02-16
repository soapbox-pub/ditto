import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE OR REPLACE FUNCTION notify_nostr_event()
    RETURNS TRIGGER AS $$
    DECLARE 
        payload JSON;
    BEGIN
        payload := json_build_object(
            'id', NEW.id,
            'kind', NEW.kind,
            'pubkey', NEW.pubkey,
            'content', NEW.content,
            'tags', NEW.tags,
            'created_at', NEW.created_at,
            'sig', NEW.sig
        );

        PERFORM pg_notify('nostr_event', payload::text);

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    CREATE TRIGGER nostr_event_trigger
    AFTER INSERT OR UPDATE ON nostr_events
    FOR EACH ROW EXECUTE FUNCTION notify_nostr_event()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER nostr_event_trigger ON nostr_events`.execute(db);
  await sql`DROP FUNCTION notify_nostr_event()`.execute(db);
}
