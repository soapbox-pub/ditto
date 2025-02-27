import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';
import { JsonParseStream } from '@std/json/json-parse-stream';
import { TextLineStream } from '@std/streams/text-line-stream';

import { DittoPgStore } from '../packages/ditto/storages/DittoPgStore.ts';
import { type EventStub } from '../packages/ditto/utils/api.ts';
import { nostrNow } from '../packages/ditto/utils.ts';

const conf = new DittoConf(Deno.env);
const db = new DittoPolyPg(conf.databaseUrl);
const relay = new DittoPgStore({ db, conf });

const { signer } = conf;

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

  await relay.event(event);
}

Deno.exit(0);
