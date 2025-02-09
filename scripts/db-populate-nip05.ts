import { Semaphore } from '@lambdalisue/async';

import { updateAuthorData } from '@/pipeline.ts';
import { Storages } from '@/storages.ts';
import { NostrEvent } from '@nostrify/nostrify';

const kysely = await Storages.kysely();
const sem = new Semaphore(5);

const query = kysely
  .selectFrom('nostr_events')
  .select(['id', 'kind', 'content', 'pubkey', 'tags', 'created_at', 'sig'])
  .where('kind', '=', 0);

for await (const row of query.stream(100)) {
  while (sem.locked) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  sem.lock(async () => {
    const event: NostrEvent = { ...row, created_at: Number(row.created_at) };
    await updateAuthorData(event, AbortSignal.timeout(3000));
  });
}

Deno.exit();
