import * as Comlink from 'comlink';

import { Conf } from '@/config.ts';
import type { CustomPolicy } from '@/workers/policy.worker.ts';

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
