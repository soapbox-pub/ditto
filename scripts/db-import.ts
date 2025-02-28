import { Semaphore } from '@core/asyncutil';
import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';
import { NostrEvent } from '@nostrify/nostrify';
import { JsonParseStream } from '@std/json/json-parse-stream';
import { TextLineStream } from '@std/streams/text-line-stream';

import { DittoPgStore } from '../packages/ditto/storages/DittoPgStore.ts';

const conf = new DittoConf(Deno.env);
const db = new DittoPolyPg(conf.databaseUrl);
const relay = new DittoPgStore({ db, conf });
const sem = new Semaphore(conf.pg.poolSize);

console.warn('Importing events...');

let count = 0;

const readable = Deno.stdin.readable
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new TextLineStream())
  .pipeThrough(new JsonParseStream());

for await (const line of readable) {
  const event = line as unknown as NostrEvent;

  while (sem.locked) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  sem.lock(async () => {
    try {
      await relay.event(event);
      console.warn(`(${count}) Event<${event.kind}> ${event.id}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('violates unique constraint')) {
        console.warn(`(${count}) Skipping existing event... ${event.id}`);
      } else {
        console.error(error);
      }
    }
    count++;
  });
}

console.warn(`Imported ${count} events`);
Deno.exit();
