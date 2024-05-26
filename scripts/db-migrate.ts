import { DittoDB } from '@/db/DittoDB.ts';

const kysely = await DittoDB.getInstance();
await kysely.destroy();

Deno.exit();
