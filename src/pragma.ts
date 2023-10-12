import { type Kysely, sql } from '@/deps.ts';

/** Set the PRAGMA and then read back its value to confirm. */
function setPragma(db: Kysely<any>, pragma: string, value: string | number) {
  return sql.raw(`PRAGMA ${pragma} = ${value}`).execute(db);
}

/** Get value of PRAGMA from the database. */
async function getPragma(db: Kysely<any>, pragma: string) {
  const result = await sql.raw(`PRAGMA ${pragma}`).execute(db);
  const row = result.rows[0] as Record<string, unknown>;
  return row[pragma];
}

export { getPragma, setPragma };
