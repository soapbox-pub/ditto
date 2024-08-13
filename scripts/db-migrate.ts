import { Conf } from '@/config.ts';
import { DittoDB } from '@/db/DittoDB.ts';
import { sleep } from '@/test.ts';

if (Deno.env.get('CI') && Conf.db.dialect === 'postgres') {
  console.info('Waiting 1 second for postgres to start...');
  await sleep(1_000);
}

// This migrates kysely internally.
const { kysely } = await DittoDB.getInstance();

// Close the connection before exiting.
await kysely.destroy();

Deno.exit();
