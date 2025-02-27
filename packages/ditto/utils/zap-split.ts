import { NSchema as n, NStore } from '@nostrify/nostrify';
import { nostrNow } from '@/utils.ts';
import { percentageSchema } from '@/schema.ts';

import type { DittoConf } from '@ditto/conf';

type Pubkey = string;
type ExtraMessage = string;
/** Number from 1 to 100, stringified. */
type splitPercentages = number;

export type DittoZapSplits = {
  [key: Pubkey]: { weight: splitPercentages; message: ExtraMessage };
};

interface GetZapSplitsOpts {
  conf: DittoConf;
  relay: NStore;
}

/** Gets zap splits from NIP-78 in DittoZapSplits format. */
export async function getZapSplits(pubkey: string, opts: GetZapSplitsOpts): Promise<DittoZapSplits | undefined> {
  const { relay } = opts;

  const zapSplits: DittoZapSplits = {};

  const [event] = await relay.query([{
    authors: [pubkey],
    kinds: [30078],
    '#d': ['pub.ditto.zapSplits'],
    limit: 1,
  }]);
  if (!event) return;

  for (const tag of event.tags) {
    if (
      tag[0] === 'p' && n.id().safeParse(tag[1]).success &&
      percentageSchema.safeParse(tag[2]).success
    ) {
      zapSplits[tag[1]] = { weight: Number(tag[2]), message: tag[3] };
    }
  }

  return zapSplits;
}

export async function seedZapSplits(opts: GetZapSplitsOpts): Promise<void> {
  const { conf, relay } = opts;

  const pubkey = await conf.signer.getPublicKey();
  const zapSplit: DittoZapSplits | undefined = await getZapSplits(pubkey, opts);

  if (!zapSplit) {
    const dittoPubkey = '781a1527055f74c1f70230f10384609b34548f8ab6a0a6caa74025827f9fdae5';
    const dittoMsg = 'Official Ditto Account';

    const event = await conf.signer.signEvent({
      content: '',
      created_at: nostrNow(),
      kind: 30078,
      tags: [
        ['d', 'pub.ditto.zapSplits'],
        ['p', dittoPubkey, '5', dittoMsg],
      ],
    });

    await relay.event(event);
  }
}
