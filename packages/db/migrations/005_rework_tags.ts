import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('tags_new')
    .addColumn('tag', 'text', (col) => col.notNull())
    .addColumn('value', 'text', (col) => col.notNull())
    .addColumn('event_id', 'text', (col) => col.references('events.id').onDelete('cascade'))
    .execute();

  await sql`
    INSERT INTO tags_new (tag, value, event_id)
    SELECT tag, value_1 as value, event_id
    FROM tags
    WHERE value_1 IS NOT NULL
  `.execute(db);

  await db.schema
    .dropTable('tags')
    .execute();

  await db.schema
    .alterTable('tags_new')
    .renameTo('tags').execute();

  await db.schema
    .createIndex('idx_tags_tag')
    .on('tags')
    .column('tag')
    .execute();

  await db.schema
    .createIndex('idx_tags_value')
    .on('tags')
    .column('value')
    .execute();

  await db.schema
    .createIndex('idx_tags_event_id')
    .on('tags')
    .column('event_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('tags').execute();

  await db.schema
    .createTable('tags')
    .addColumn('tag', 'text', (col) => col.notNull())
    .addColumn('value_1', 'text')
    .addColumn('value_2', 'text')
    .addColumn('value_3', 'text')
    .addColumn('event_id', 'text', (col) => col.notNull())
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
}
