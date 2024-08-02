import { NostrEvent } from '@nostrify/nostrify';
import { JsonParseStream } from '@std/json/json-parse-stream';
import { TextLineStream } from '@std/streams/text-line-stream';

import { Storages } from '@/storages.ts';

const store = await Storages.db();

console.warn('Importing events...');

let count = 0;

const readable = Deno.stdin.readable
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new TextLineStream())
  .pipeThrough(new JsonParseStream());

for await (const event of readable) {
  await store.event(event as unknown as NostrEvent);
  count++;
}

console.warn(`Imported ${count} events`);
Deno.exit();
