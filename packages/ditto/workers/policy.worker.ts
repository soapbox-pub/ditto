// @ts-ignore Don't try to access the env from this worker.
Deno.env = new Map<string, string>();

import { DittoPolyPg } from '@ditto/db';
import '@soapbox/safe-fetch/load';
import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/nostrify';
import { ReadOnlyPolicy } from '@nostrify/policies';
import * as Comlink from 'comlink';

import { DittoPgStore } from '@/storages/DittoPgStore.ts';

/** Serializable object the worker can use to set up the state. */
interface PolicyInit {
  /** Path to the policy module (https, jsr, file, etc) */
  path: string;
  /** Database URL to connect to. */
  databaseUrl: string;
  /** Admin pubkey to use for DittoPgStore checks. */
  pubkey: string;
}

export class CustomPolicy implements NPolicy {
  private policy: NPolicy = new ReadOnlyPolicy();

  // deno-lint-ignore require-await
  async call(event: NostrEvent, signal?: AbortSignal): Promise<NostrRelayOK> {
    return this.policy.call(event, signal);
  }

  async init({ path, databaseUrl, pubkey }: PolicyInit): Promise<void> {
    const Policy = (await import(path)).default;

    const db = new DittoPolyPg(databaseUrl, { poolSize: 1 });

    const store = new DittoPgStore({
      db,
      pubkey,
      timeout: 5_000,
    });

    this.policy = new Policy({ store, pubkey });
  }
}

Comlink.expose(new CustomPolicy());
