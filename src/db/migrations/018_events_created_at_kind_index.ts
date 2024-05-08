import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createIndex('idx_events_created_at_kind')
    .on('events')
    .columns(['created_at desc', 'kind'])
    .ifNotExists()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idx_events_created_at_kind').ifExists().execute();
}
