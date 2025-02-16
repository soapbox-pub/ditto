import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_tags_tag').execute();
  await db.schema.dropIndex('idx_tags_value').execute();

  await db.schema
    .createIndex('idx_tags_tag_value')
    .on('tags')
    .columns(['tag', 'value'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_tags_tag_value').execute();

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
}
