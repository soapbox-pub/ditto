import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('nostr_tags_new')
    .addColumn('event_id', 'text', (col) => col.notNull().references('nostr_events.id').onDelete('cascade'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('value', 'text', (col) => col.notNull())
    .addColumn('kind', 'integer', (col) => col.notNull())
    .addColumn('pubkey', 'text', (col) => col.notNull())
    .addColumn('created_at', 'integer', (col) => col.notNull())
    .execute();

  let iid: number | undefined;
  const tid = setTimeout(() => {
    console.warn(
      'Recreating the tags table to boost performance. Depending on the size of your database, this could take a very long time, even as long as 2 days!',
    );
    const emojis = ['⚡', '🐛', '🔎', '😂', '😅', '😬', '😭', '🙃', '🤔', '🧐', '🧐', '🫠'];
    iid = setInterval(() => {
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      console.info(`Recreating tags table... ${emoji}`);
    }, 60_000);
  }, 10_000);

  // Copy data to the new table.
  await sql`
    INSERT INTO
      nostr_tags_new (name, value, event_id, kind, pubkey, created_at)
    SELECT
      t.name, t.value, t.event_id, e.kind, e.pubkey, e.created_at
    FROM
      nostr_tags as t LEFT JOIN nostr_events e on t.event_id = e.id;
  `.execute(db);

  clearTimeout(tid);
  if (iid) clearInterval(iid);

  // Drop the old table and rename it.
  await db.schema.dropTable('nostr_tags').execute();
  await db.schema.alterTable('nostr_tags_new').renameTo('nostr_tags').execute();

  await db.schema
    .createIndex('nostr_tags_created_at')
    .on('nostr_tags')
    .ifNotExists()
    .columns(['value', 'name', 'created_at desc', 'event_id asc'])
    .execute();
  await db.schema
    .createIndex('nostr_tags_kind_created_at')
    .on('nostr_tags')
    .ifNotExists()
    .columns(['value', 'name', 'kind', 'created_at desc', 'event_id asc'])
    .execute();
  await db.schema
    .createIndex('nostr_tags_kind_pubkey_created_at')
    .on('nostr_tags')
    .ifNotExists()
    .columns(['value', 'name', 'kind', 'pubkey', 'created_at desc', 'event_id asc'])
    .execute();
  await db.schema
    .createIndex('nostr_tags_trends')
    .on('nostr_tags')
    .ifNotExists()
    .columns(['created_at', 'name', 'kind'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('nostr_tags_old')
    .addColumn('event_id', 'text', (col) => col.references('nostr_events.id').onDelete('cascade'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('value', 'text', (col) => col.notNull())
    .addColumn('kind', 'integer', (col) => col.notNull())
    .addColumn('pubkey', 'text', (col) => col.notNull())
    .addColumn('created_at', 'integer', (col) => col.notNull())
    .execute();

  await sql`
    INSERT INTO
      nostr_tags_old (name, value, event_id) 
    SELECT
      name, value, event_id
    FROM
      nostr_tags;
  `.execute(db);

  await db.schema.dropTable('nostr_tags').execute();
  await db.schema.alterTable('nostr_tags_old').renameTo('nostr_tags').execute();

  await db.schema.createIndex('idx_tags_event_id').on('nostr_tags').ifNotExists().column('event_id').execute();
  await db.schema.createIndex('idx_tags_name').on('nostr_tags').ifNotExists().column('name').execute();
  await db.schema.createIndex('idx_tags_tag_value').on('nostr_tags').ifNotExists().columns(['name', 'value']).execute();
}
