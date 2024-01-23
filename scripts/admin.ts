import * as pipeline from '@/pipeline.ts';
import { signAdminEvent } from '@/sign.ts';
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
  const event = await signAdminEvent({
    content: '',
    created_at: nostrNow(),
    tags: [],
    ...t,
  });

  await pipeline.handleEvent(event, AbortSignal.timeout(5000));
}
