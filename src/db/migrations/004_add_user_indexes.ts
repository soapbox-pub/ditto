import { Kysely } from '@/deps.ts';

export async function up(_db: Kysely<any>): Promise<void> {
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idx_users_pubkey').execute();
  await db.schema.dropIndex('idx_users_username').execute();
}
