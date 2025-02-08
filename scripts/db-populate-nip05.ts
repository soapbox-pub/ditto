import { Semaphore } from '@lambdalisue/async';
import { NSchema as n } from '@nostrify/nostrify';

import { Storages } from '@/storages.ts';
import { faviconCache } from '@/utils/favicon.ts';
import { nip05Cache } from '@/utils/nip05.ts';

const kysely = await Storages.kysely();
const sem = new Semaphore(5);

const query = kysely
  .selectFrom('nostr_events')
  .select('content')
  .where('kind', '=', 0);

for await (const { content } of query.stream(100)) {
  while (sem.locked) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  sem.lock(async () => {
    const signal = AbortSignal.timeout(30_000); // generous timeout

    // Parse metadata.
    const metadata = n.json().pipe(n.metadata()).catch({}).safeParse(content);
    if (!metadata.success) return;

    // Update nip05.
    const { nip05 } = metadata.data;
    if (nip05) {
      try {
        await nip05Cache.fetch(nip05, { signal });
      } catch {
        // Ignore.
      }
    }

    // Update favicon.
    const domain = nip05?.split('@')[1].toLowerCase();
    if (domain) {
      try {
        await faviconCache.fetch(domain, { signal });
      } catch {
        // Ignore.
      }
    }
  });
}

Deno.exit();
