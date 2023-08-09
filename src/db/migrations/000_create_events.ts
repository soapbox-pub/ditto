import { Kysely, sql } from '@/deps.ts';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('events')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('kind', 'integer', (col) => col.notNull())
    .addColumn('pubkey', 'text', (col) => col.notNull())
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('created_at', 'integer', (col) => col.notNull())
    .addColumn('tags', 'text', (col) => col.notNull())
    .addColumn('sig', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('tags')
    .addColumn('tag', 'text', (col) => col.notNull())
    .addColumn('value_1', 'text')
    .addColumn('value_2', 'text')
    .addColumn('value_3', 'text')
    .addColumn('event_id', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('users')
    .addColumn('pubkey', 'text', (col) => col.primaryKey())
    .addColumn('username', 'text', (col) => col.notNull().unique())
    .addColumn('inserted_at', 'datetime', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createIndex('idx_events_kind')
    .on('events')
    .column('kind')
    .execute();

  await db.schema
    .createIndex('idx_events_pubkey')
    .on('events')
    .column('pubkey')
    .execute();

  await db.schema
    .createIndex('idx_tags_tag')
    .on('tags')
    .column('tag')
    .execute();

  await db.schema
    .createIndex('idx_tags_value_1')
    .on('tags')
    .column('value_1')
    .execute();

  await db.schema
    .createIndex('idx_tags_event_id')
    .on('tags')
    .column('event_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('events').execute();
  await db.schema.dropTable('tags').execute();
  await db.schema.dropTable('users').execute();
}
