import { addRelays } from '@/db/relays.ts';
import { filteredArray } from '@/schema.ts';
import { relaySchema } from '@/utils.ts';

switch (Deno.args[0]) {
  case 'sync':
    await sync(Deno.args.slice(1));
    break;
  default:
    console.log('Usage: deno run -A scripts/relays.ts sync <url>');
}

async function sync([url]: string[]) {
  if (!url) {
    console.error('Error: please provide a URL');
    Deno.exit(1);
  }
  const response = await fetch(url);
  const data = await response.json();
  const values = filteredArray(relaySchema).parse(data) as `wss://${string}`[];
  await addRelays(values, { active: true });
  console.log(`Done: added ${values.length} relays.`);
}
