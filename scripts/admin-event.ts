import { JsonParseStream } from '@std/json/json-parse-stream';
import { TextLineStream } from '@std/streams/text-line-stream';

import { DittoDB } from '@/db/DittoDB.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { EventsDB } from '@/storages/EventsDB.ts';
import { type EventStub } from '@/utils/api.ts';
import { nostrNow } from '@/utils.ts';

const signer = new AdminSigner();

const db = await DittoDB.getInstance();
const eventsDB = new EventsDB(db);

const readable = Deno.stdin.readable
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new TextLineStream())
  .pipeThrough(new JsonParseStream());

for await (const t of readable) {
  const event = await signer.signEvent({
    content: '',
    created_at: nostrNow(),
    tags: [],
    ...t as EventStub,
  });

  await eventsDB.event(event);
}

Deno.exit(0);
