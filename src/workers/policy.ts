import * as Comlink from 'comlink';

import { Conf } from '@/config.ts';
import type { CustomPolicy } from '@/workers/policy.worker.ts';

const policyDir = new URL('../../data/policy', import.meta.url).pathname;

export const policyWorker = Comlink.wrap<CustomPolicy>(
  new Worker(
    new URL('./policy.worker.ts', import.meta.url),
    {
      type: 'module',
      deno: {
        permissions: {
          read: [Conf.policy, policyDir],
          write: [policyDir],
          net: 'inherit',
          env: false,
        },
      },
    },
  ),
);
