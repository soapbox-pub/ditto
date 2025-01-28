import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import * as Comlink from 'comlink';

import { Conf } from '@/config.ts';
import type { CustomPolicy } from '@/workers/policy.worker.ts';

import '@/workers/handlers/abortsignal.ts';

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
          deno: {
            permissions: {
              read: [Conf.denoDir, Conf.policy, Conf.dataDir],
              write: [Conf.dataDir],
              net: 'inherit',
              env: false,
              import: true,
            },
          },
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

      logi({
        level: 'info',
        ns: 'ditto.system.policy',
        message: 'Using custom policy',
        path: Conf.policy,
        enabled: true,
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes('Module not found')) {
        logi({
          level: 'info',
          ns: 'ditto.system.policy',
          message: 'Custom policy not found <https://docs.soapbox.pub/ditto/policies/>',
          path: null,
          enabled: false,
        });
        this.enabled = false;
        return;
      }

      if (e instanceof Error && e.message.includes('PGlite is not supported in worker threads')) {
        logi({
          level: 'warn',
          ns: 'ditto.system.policy',
          message: 'Custom policies are not supported with PGlite. The policy is disabled.',
          path: Conf.policy,
          enabled: false,
        });
        this.enabled = false;
        return;
      }

      throw new Error(`DITTO_POLICY (error importing policy): ${Conf.policy}`);
    }
  }
}

export const policyWorker = new PolicyWorker();
