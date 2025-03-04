import { DittoConf } from '@ditto/conf';
import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import * as Comlink from 'comlink';

import { errorJson } from '@/utils/log.ts';

import type { CustomPolicy } from '@/workers/policy.worker.ts';

export class PolicyWorker implements NPolicy {
  private worker: Comlink.Remote<CustomPolicy>;
  private ready: Promise<void>;
  private enabled = true;

  constructor(private conf: DittoConf) {
    this.worker = Comlink.wrap<CustomPolicy>(
      new Worker(
        new URL('./policy.worker.ts', import.meta.url),
        {
          type: 'module',
          name: 'PolicyWorker',
          deno: {
            permissions: {
              read: [conf.denoDir, conf.policy, conf.dataDir],
              write: [conf.dataDir],
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
    const conf = this.conf;

    try {
      await this.worker.init({
        path: conf.policy,
        databaseUrl: conf.databaseUrl,
        pubkey: await conf.signer.getPublicKey(),
      });

      logi({
        level: 'info',
        ns: 'ditto.system.policy',
        msg: 'Using custom policy',
        path: conf.policy,
        enabled: true,
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes('Module not found')) {
        logi({
          level: 'info',
          ns: 'ditto.system.policy',
          msg: 'Custom policy not found <https://docs.soapbox.pub/ditto/policies/>',
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
          msg: 'Custom policies are not supported with PGlite. The policy is disabled.',
          path: conf.policy,
          enabled: false,
        });
        this.enabled = false;
        return;
      }

      logi({
        level: 'error',
        ns: 'ditto.system.policy',
        msg: 'Failed to load custom policy',
        path: conf.policy,
        error: errorJson(e),
        enabled: false,
      });

      throw new Error(`DITTO_POLICY (error importing policy): ${conf.policy}`);
    }
  }
}
