import { Kysely } from '@/deps.ts';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createIndex('idx_users_pubkey')
    .on('users')
    .column('pubkey')
    .execute();

  await db.schema
    .createIndex('idx_users_username')
    .on('users')
    .column('username')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idx_users_pubkey').execute();
  await db.schema.dropIndex('idx_users_username').execute();
}
