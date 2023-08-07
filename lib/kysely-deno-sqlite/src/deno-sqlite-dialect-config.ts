import { type DenoSqlite, type SqliteDialectConfig } from '../deps.ts';

interface DenoSqliteDialectConfig extends Omit<SqliteDialectConfig, 'database'> {
  database: DenoSqlite | (() => Promise<DenoSqlite>);
}

export type { DenoSqliteDialectConfig };
