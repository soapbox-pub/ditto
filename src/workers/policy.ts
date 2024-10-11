import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/nostrify';
import { Stickynotes } from '@soapbox/stickynotes';
import * as Comlink from 'comlink';

import { Conf } from '@/config.ts';
import type { CustomPolicy } from '@/workers/policy.worker.ts';

import '@/workers/handlers/abortsignal.ts';

const console = new Stickynotes('ditto:policy');

class PolicyWorker implements NPolicy {
  private worker: Comlink.Remote<CustomPolicy>;
  private ready: Promise<void>;
  private enabled = true;

  constructor() {
    this.worker = Comlink.wrap<CustomPolicy>(
      new Worker(
        new URL('./policy.worker.ts', import.meta.url),
        {
          type: 'module',
          name: 'PolicyWorker',
          // FIXME: Disabled until Deno 2.0 adds support for `import` permission here.
          // https://github.com/denoland/deno/issues/26074
          // deno: {
          //   permissions: {
          //     read: [Conf.denoDir, Conf.policy, Conf.dataDir],
          //     write: [Conf.dataDir],
          //     net: 'inherit',
          //     env: false,
          //   },
          // },
        },
      ),
    );

    this.ready = this.init();
  }

  async call(event: NostrEvent, signal?: AbortSignal): Promise<NostrRelayOK> {
    await this.ready;

    if (!this.enabled) {
      return ['OK', event.id, true, ''];
    }

    return this.worker.call(event, signal);
  }

  private async init(): Promise<void> {
    try {
      await this.worker.init({
        path: Conf.policy,
        databaseUrl: Conf.databaseUrl,
        pubkey: Conf.pubkey,
      });

      console.warn(`Using custom policy: ${Conf.policy}`);
    } catch (e) {
      if (e instanceof Error && e.message.includes('Module not found')) {
        console.warn('Custom policy not found <https://docs.soapbox.pub/ditto/policies/>');
        this.enabled = false;
        return;
      }

      if (e instanceof Error && e.message.includes('PGlite is not supported in worker threads')) {
        console.warn('Custom policies are not supported with PGlite. The policy is disabled.');
        this.enabled = false;
        return;
      }

      throw new Error(`DITTO_POLICY (error importing policy): ${Conf.policy}`);
    }
  }
}

export const policyWorker = new PolicyWorker();
