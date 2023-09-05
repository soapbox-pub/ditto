import { Kysely, sql } from '@/deps.ts';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`PRAGMA foreign_keys = ON`.execute(db);
  await sql`PRAGMA auto_vacuum = FULL`.execute(db);
  await sql`VACUUM`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`PRAGMA foreign_keys = OFF`.execute(db);
  await sql`PRAGMA auto_vacuum = NONE`.execute(db);
}
