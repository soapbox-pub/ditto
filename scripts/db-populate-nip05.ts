import { NSchema as n } from '@nostrify/nostrify';

import { Storages } from '@/storages.ts';
import { faviconCache } from '@/utils/favicon.ts';
import { nip05Cache } from '@/utils/nip05.ts';

const store = await Storages.db();
const kysely = await Storages.kysely();
const statsQuery = kysely.selectFrom('author_stats').select('pubkey');

for await (const { pubkey } of statsQuery.stream(10)) {
  const signal = AbortSignal.timeout(30_000); // generous timeout

  try {
    const [author] = await store.query([{ kinds: [0], authors: [pubkey], limit: 1 }]);

    if (!author) {
      continue;
    }

    // Parse metadata.
    const metadata = n.json().pipe(n.metadata()).catch({}).safeParse(author.content);
    if (!metadata.success) continue;

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
      await faviconCache.fetch(domain, { signal });
    }
  } catch {
    continue;
  }
}

Deno.exit();
