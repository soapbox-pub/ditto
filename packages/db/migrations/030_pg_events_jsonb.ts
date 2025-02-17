import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create new table and indexes.
  await db.schema
    .createTable('nostr_events_new')
    .addColumn('id', 'char(64)', (col) => col.primaryKey())
    .addColumn('kind', 'integer', (col) => col.notNull())
    .addColumn('pubkey', 'char(64)', (col) => col.notNull())
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('created_at', 'bigint', (col) => col.notNull())
    .addColumn('tags', 'jsonb', (col) => col.notNull())
    .addColumn('tags_index', 'jsonb', (col) => col.notNull())
    .addColumn('sig', 'char(128)', (col) => col.notNull())
    .addColumn('d', 'text')
    .addColumn('search', sql`tsvector`)
    .addCheckConstraint('nostr_events_kind_chk', sql`kind >= 0`)
    .addCheckConstraint('nostr_events_created_chk', sql`created_at >= 0`)
    .addCheckConstraint(
      'nostr_events_d_chk',
      sql`(kind >= 30000 and kind < 40000 and d is not null) or ((kind < 30000 or kind >= 40000) and d is null)`,
    )
    .ifNotExists()
    .execute();

  await db.schema
    .createIndex('nostr_events_created_kind_idx')
    .on('nostr_events_new')
    .columns(['created_at desc', 'id asc', 'kind', 'pubkey'])
    .ifNotExists()
    .execute();

  await db.schema
    .createIndex('nostr_events_pubkey_created_idx')
    .on('nostr_events_new')
    .columns(['pubkey', 'created_at desc', 'id asc', 'kind'])
    .ifNotExists()
    .execute();

  await db.schema
    .createIndex('nostr_events_tags_idx').using('gin')
    .on('nostr_events_new')
    .column('tags_index')
    .ifNotExists()
    .execute();

  await db.schema
    .createIndex('nostr_events_replaceable_idx')
    .on('nostr_events_new')
    .columns(['kind', 'pubkey'])
    .where(() => sql`kind >= 10000 and kind < 20000 or (kind in (0, 3))`)
    .unique()
    .ifNotExists()
    .execute();

  await db.schema
    .createIndex('nostr_events_parameterized_idx')
    .on('nostr_events_new')
    .columns(['kind', 'pubkey', 'd'])
    .where(() => sql`kind >= 30000 and kind < 40000`)
    .unique()
    .ifNotExists()
    .execute();

  await db.schema
    .createIndex('nostr_events_search_idx').using('gin')
    .on('nostr_events_new')
    .column('search')
    .ifNotExists()
    .execute();

  let iid: number | undefined;
  const tid = setTimeout(() => {
    console.warn(`Recreating the database to improve performance. This will take several hours.

If you don't want to wait, you can create a fresh database and then import your old events:

1. Revert to a prior commit: e789e08c
2. Export your events: "deno task db:export > events.jsonl"
3. Checkout the latest commit: "git checkout main && git pull"
4. Drop your old database: "dropdb ditto"
5. Create a new database: "createdb ditto"
6. Start Ditto
7. While Ditto is running, import your events: "cat events.jsonl | deno task db:import"`);

    const emojis = ['⚡', '🐛', '🔎', '😂', '😅', '😬', '😭', '🙃', '🤔', '🧐', '🧐', '🫠'];
    iid = setInterval(() => {
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      console.info(`Recreating the database... ${emoji}`);
    }, 60_000);
  }, 10_000);

  // Copy data to the new table.
  await sql`
  INSERT INTO nostr_events_new(id, kind, pubkey, content, created_at, tags, sig, d, tags_index, search)
  SELECT 
      e.id, 
      e.kind, 
      e.pubkey, 
      e.content, 
      e.created_at, 
      e.tags::jsonb, 
      e.sig,
      t_agg.tags_index->'d'->>0 as d,
      COALESCE(t_agg.tags_index, '{}'::jsonb) as tags_index,
      fts.search_vec
  FROM
      nostr_events AS e
  LEFT JOIN
      (SELECT event_id, jsonb_object_agg(name, values_array) as tags_index
          FROM (
              SELECT event_id, name, jsonb_agg(value) as values_array
              FROM nostr_tags
              GROUP BY event_id, name
              ) sub
          GROUP BY event_id) AS t_agg ON e.id = t_agg.event_id
  LEFT JOIN
      nostr_pgfts AS fts ON e.id = fts.event_id
  WHERE 
      (e.kind >= 30000 AND e.kind < 40000 AND t_agg.tags_index->'d'->>0 IS NOT NULL)
      OR ((e.kind < 30000 OR e.kind >= 40000) AND t_agg.tags_index->'d'->>0 IS NULL)
  ON CONFLICT DO NOTHING;
  `.execute(db);

  clearTimeout(tid);
  if (iid) clearInterval(iid);

  await db.schema.dropTable('nostr_events').cascade().execute();
  await db.schema.dropTable('nostr_tags').execute();
  await db.schema.dropTable('nostr_pgfts').execute();

  await db.schema.alterTable('nostr_events_new').renameTo('nostr_events').execute();
}

export function down(_db: Kysely<unknown>): Promise<void> {
  throw new Error("Sorry, you can't migrate back from here.");
}
