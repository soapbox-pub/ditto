import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.schema
      .createTable('trends_tag_usages')
      .ifNotExists()
      .addColumn('tag', 'text', (c) => c.notNull().modifyEnd(sql`collate nocase`))
      .addColumn('pubkey8', 'text', (c) => c.notNull())
      .addColumn('inserted_at', 'integer', (c) => c.notNull())
      .execute();

    await trx.schema
      .createIndex('trends_idx_time_tag')
      .ifNotExists()
      .on('trends_tag_usages')
      .column('inserted_at')
      .column('tag')
      .execute();
  });
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.schema.dropIndex('trends_idx_time_tag').ifExists().execute();
    await trx.schema.dropTable('trends_tag_usages').ifExists().execute();
  });
}
