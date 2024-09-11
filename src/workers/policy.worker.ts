import 'deno-safe-fetch/load';
import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/nostrify';
import { NoOpPolicy, ReadOnlyPolicy } from '@nostrify/nostrify/policies';
import * as Comlink from 'comlink';

import { DittoDB } from '@/db/DittoDB.ts';
import { EventsDB } from '@/storages/EventsDB.ts';

export class CustomPolicy implements NPolicy {
  private policy: NPolicy = new ReadOnlyPolicy();

  // deno-lint-ignore require-await
  async call(event: NostrEvent): Promise<NostrRelayOK> {
    return this.policy.call(event);
  }

  async init(path: string, databaseUrl: string, adminPubkey: string): Promise<void> {
    const { kysely } = DittoDB.create(databaseUrl, { poolSize: 1 });

    const store = new EventsDB({
      kysely,
      pubkey: adminPubkey,
      timeout: 1_000,
    });

    try {
      const Policy = (await import(path)).default;
      this.policy = new Policy({ store });
    } catch (e) {
      if (e.message.includes('Module not found')) {
        this.policy = new NoOpPolicy();
      }
      throw e;
    }
  }
}

Comlink.expose(new CustomPolicy());
