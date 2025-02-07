import { NSchema as n } from '@nostrify/nostrify';

import { Storages } from '@/storages.ts';
import { faviconCache } from '@/utils/favicon.ts';
import { nip05Cache } from '@/utils/nip05.ts';

const store = await Storages.db();

for await (const msg of store.req([{ kinds: [0] }])) {
  if (msg[0] === 'EVENT') {
    const signal = AbortSignal.timeout(30_000); // generous timeout
    const event = msg[2];

    try {
      // Parse metadata.
      const metadata = n.json().pipe(n.metadata()).catch({}).safeParse(event.content);
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
}

Deno.exit();
