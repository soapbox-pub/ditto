import { DittoConf } from '@ditto/conf';

import { getInstanceMetadata } from '@/utils/instance.ts';

import type { NStore } from '@nostrify/nostrify';

interface CreateNip89Opts {
  conf: DittoConf;
  relay: NStore;
  signal?: AbortSignal;
}

/**
 * Creates a NIP-89 application handler event (kind 31990)
 * This identifies Ditto as a client that can handle various kinds of events
 */
export async function createNip89(opts: CreateNip89Opts): Promise<void> {
  const { conf, relay, signal } = opts;

  const { event: _, ...metadata } = await getInstanceMetadata(opts);

  const event = await conf.signer.signEvent({
    kind: 31990,
    tags: [
      ['d', 'ditto'],
      ['k', '1'],
      ['t', 'ditto'],
      ['web', conf.local('/<bech32>'), 'web'],
    ],
    content: JSON.stringify(metadata),
    created_at: Math.floor(Date.now() / 1000),
  });

  await relay.event(event, { signal });
}
