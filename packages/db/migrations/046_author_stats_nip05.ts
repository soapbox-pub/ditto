import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('author_stats')
    .addColumn('nip05', 'varchar(320)')
    .addColumn('nip05_domain', 'varchar(253)')
    .addColumn('nip05_hostname', 'varchar(253)')
    .addColumn('nip05_last_verified_at', 'integer')
    .execute();

  await db.schema
    .alterTable('author_stats')
    .addCheckConstraint('author_stats_nip05_domain_lowercase_chk', sql`nip05_domain = lower(nip05_domain)`)
    .execute();

  await db.schema
    .alterTable('author_stats')
    .addCheckConstraint('author_stats_nip05_hostname_lowercase_chk', sql`nip05_hostname = lower(nip05_hostname)`)
    .execute();

  await db.schema
    .alterTable('author_stats')
    .addCheckConstraint('author_stats_nip05_hostname_domain_chk', sql`nip05_hostname like '%' || nip05_domain`)
    .execute();

  await db.schema
    .createIndex('author_stats_nip05_domain_idx')
    .on('author_stats')
    .column('nip05_domain')
    .execute();

  await db.schema
    .createIndex('author_stats_nip05_hostname_idx')
    .on('author_stats')
    .column('nip05_hostname')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('author_stats')
    .dropColumn('nip05')
    .dropColumn('nip05_domain')
    .dropColumn('nip05_hostname')
    .dropColumn('nip05_last_verified_at')
    .execute();
}
