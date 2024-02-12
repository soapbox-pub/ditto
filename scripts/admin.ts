import * as pipeline from '@/pipeline.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { type EventStub } from '@/utils/api.ts';
import { nostrNow } from '@/utils.ts';

switch (Deno.args[0]) {
  case 'publish':
    await publish(JSON.parse(Deno.args[1]));
    break;
  default:
    console.log('Usage: deno run -A scripts/admin.ts <command>');
}

async function publish(t: EventStub) {
  const signer = new AdminSigner();

  const event = await signer.signEvent({
    content: '',
    created_at: nostrNow(),
    tags: [],
    ...t,
  });

  await pipeline.handleEvent(event, AbortSignal.timeout(5000));
}
