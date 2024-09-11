import { Stickynotes } from '@soapbox/stickynotes';
import * as Comlink from 'comlink';

import { Conf } from '@/config.ts';
import type { CustomPolicy } from '@/workers/policy.worker.ts';

const console = new Stickynotes('ditto:policy');

export const policyWorker = Comlink.wrap<CustomPolicy>(
  new Worker(
    new URL('./policy.worker.ts', import.meta.url),
    {
      type: 'module',
      deno: {
        permissions: {
          read: [Conf.policy],
          write: false,
          net: 'inherit',
          env: false,
        },
      },
    },
  ),
);

try {
  await policyWorker.init(Conf.policy, Conf.databaseUrl, Conf.pubkey);
  console.debug(`Using custom policy: ${Conf.policy}`);
} catch (e) {
  if (e.message.includes('Module not found')) {
    console.debug('Custom policy not found <https://docs.soapbox.pub/ditto/policies/>');
  } else {
    throw new Error(`DITTO_POLICY (error importing policy): ${Conf.policy}`, e);
  }
}
