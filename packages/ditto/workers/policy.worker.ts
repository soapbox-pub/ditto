import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';
import '@soapbox/safe-fetch/load';
import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/nostrify';
import { ReadOnlyPolicy } from '@nostrify/policies';
import * as Comlink from 'comlink';

import { ReadOnlySigner } from '@/signers/ReadOnlySigner.ts';
import { DittoPgStore } from '@/storages/DittoPgStore.ts';

// @ts-ignore Don't try to access the env from this worker.
Deno.env = new Map<string, string>();

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

    const conf = new Proxy(new DittoConf(new Map()), {
      get(target, prop) {
        if (prop === 'signer') {
          return new ReadOnlySigner(pubkey);
        }
        return Reflect.get(target, prop);
      },
    });

    const store = new DittoPgStore({
      db,
      conf,
      timeout: 5_000,
    });

    this.policy = new Policy({ db, store, pubkey });
  }
}

Comlink.expose(new CustomPolicy());
