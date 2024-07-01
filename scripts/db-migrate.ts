import { DittoDB } from '@/db/DittoDB.ts';
import { delay } from '@/test.ts';

if (Deno.env.get('CI') && Deno.env.get('DATABASE_URL')?.startsWith('postgres')) {
    console.info('Waiting 15 seconds for postgres to start...');
    await delay(15000);
}

const kysely = await DittoDB.getInstance();
await kysely.destroy();

Deno.exit();
