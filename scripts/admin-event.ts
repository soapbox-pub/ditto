import { JsonParseStream } from '@std/json/json-parse-stream';
import { TextLineStream } from '@std/streams/text-line-stream';

import { AdminSigner } from '../packages/ditto/signers/AdminSigner.ts';
import { Storages } from '../packages/ditto/storages.ts';
import { type EventStub } from '../packages/ditto/utils/api.ts';
import { nostrNow } from '../packages/ditto/utils.ts';

const signer = new AdminSigner();
const store = await Storages.db();

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

  await store.event(event);
}

Deno.exit(0);
