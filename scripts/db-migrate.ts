import { DittoDB } from '@/db/DittoDB.ts';

// This migrates kysely internally.
const { kysely } = await DittoDB.getInstance();

// Close the connection before exiting.
await kysely.destroy();

Deno.exit();
