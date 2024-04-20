import fs from 'node:fs/promises';
import path from 'node:path';

import { DittoDB } from '@/db/DittoDB.ts';
import { FileMigrationProvider, Migrator } from '@/deps.ts';

const db = await DittoDB.getInstance();

const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({
    fs,
    path,
    migrationFolder: new URL(import.meta.resolve('./db/migrations')).pathname,
  }),
});

/** Migrate the database to the latest version. */
async function migrate() {
  console.info('Running migrations...');
  const results = await migrator.migrateToLatest();

  if (results.error) {
    console.error(results.error);
    Deno.exit(1);
  } else {
    if (!results.results?.length) {
      console.info('Everything up-to-date.');
    } else {
      console.info('Migrations finished!');
      for (const { migrationName, status } of results.results!) {
        console.info(`  - ${migrationName}: ${status}`);
      }
    }
  }
}

await migrate();

export { db };
