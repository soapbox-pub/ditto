import 'deno-safe-fetch/load';
import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/nostrify';
import { ReadOnlyPolicy } from '@nostrify/policies';
import * as Comlink from 'comlink';

import { DittoDB } from '@/db/DittoDB.ts';
import { EventsDB } from '@/storages/EventsDB.ts';

import '@/workers/handlers/abortsignal.ts';

// @ts-ignore Don't try to access the env from this worker.
Deno.env = new Map<string, string>();

/** Serializable object the worker can use to set up the state. */
interface PolicyInit {
  /** Path to the policy module (https, jsr, file, etc) */
  path: string;
  /** Database URL to connect to. */
  databaseUrl: string;
  /** Admin pubkey to use for EventsDB checks. */
  adminPubkey: string;
}

export class CustomPolicy implements NPolicy {
  private policy: NPolicy = new ReadOnlyPolicy();

  // deno-lint-ignore require-await
  async call(event: NostrEvent, signal?: AbortSignal): Promise<NostrRelayOK> {
    return this.policy.call(event, signal);
  }

  async init({ path, databaseUrl, adminPubkey }: PolicyInit): Promise<void> {
    const Policy = (await import(path)).default;

    const { kysely } = DittoDB.create(databaseUrl, { poolSize: 1 });

    const store = new EventsDB({
      kysely,
      pubkey: adminPubkey,
      timeout: 1_000,
    });

    this.policy = new Policy({ store });
  }
}

Comlink.expose(new CustomPolicy());
