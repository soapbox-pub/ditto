import { NSchema as n, NStore } from '@nostrify/nostrify';
import { isNumberFrom1To100 } from '@/utils.ts';

type Pubkey = string;
type ExtraMessage = string;
/** Number from 1 to 100, stringified. */
type splitPercentages = number;

export type DittoZapSplits = {
  [key: Pubkey]: { amount: splitPercentages; message: ExtraMessage };
};

/** Gets zap splits from NIP-78 in DittoZapSplits format. */
export async function getZapSplits(store: NStore, pubkey: string): Promise<DittoZapSplits | undefined> {
  const zapSplits: DittoZapSplits = {};

  const [event] = await store.query([{
    authors: [pubkey],
    kinds: [30078],
    '#d': ['pub.ditto.zapSplits'],
    limit: 1,
  }]);
  if (!event) return;

  for (const tag of event.tags) {
    if (
      tag[0] === 'p' && n.id().safeParse(tag[1]).success &&
      isNumberFrom1To100(tag[2])
    ) {
      zapSplits[tag[1]] = { amount: Number(tag[2]), message: tag[3] };
    }
  }

  return zapSplits;
}
