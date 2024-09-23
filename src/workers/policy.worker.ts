import 'deno-safe-fetch/load';
import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/nostrify';
import { NoOpPolicy, ReadOnlyPolicy } from '@nostrify/nostrify/policies';
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
  /** Current working directory. */
  cwd: string;
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

  async init({ path, cwd, databaseUrl, adminPubkey }: PolicyInit): Promise<void> {
    // HACK: PGlite uses `path.resolve`, which requires read permission on Deno (which we don't want to give).
    // We can work around this getting the cwd from the caller and overwriting `Deno.cwd`.
    Deno.cwd = () => cwd;

    const { kysely } = DittoDB.create(databaseUrl, { poolSize: 1 });

    const store = new EventsDB({
      kysely,
      pubkey: adminPubkey,
      timeout: 1_000,
    });

    try {
      const Policy = (await import(path)).default;
      this.policy = new Policy({ store });
    } catch (e: any) {
      if (e.message.includes('Module not found')) {
        this.policy = new NoOpPolicy();
      }
      throw e;
    }
  }
}

Comlink.expose(new CustomPolicy());
