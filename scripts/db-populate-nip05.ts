import { Semaphore } from '@core/asyncutil';
import { NostrEvent } from '@nostrify/nostrify';

import { updateAuthorData } from '../packages/ditto/pipeline.ts';
import { Storages } from '../packages/ditto/storages.ts';

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
