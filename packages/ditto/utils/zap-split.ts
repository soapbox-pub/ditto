import { Conf } from '@/config.ts';
import { NSchema as n, NStore } from '@nostrify/nostrify';
import { nostrNow } from '@/utils.ts';
import { percentageSchema } from '@/schema.ts';

type Pubkey = string;
type ExtraMessage = string;
/** Number from 1 to 100, stringified. */
type splitPercentages = number;

export type DittoZapSplits = {
  [key: Pubkey]: { weight: splitPercentages; message: ExtraMessage };
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
      percentageSchema.safeParse(tag[2]).success
    ) {
      zapSplits[tag[1]] = { weight: Number(tag[2]), message: tag[3] };
    }
  }

  return zapSplits;
}

export async function seedZapSplits(store: NStore) {
  const zapSplit: DittoZapSplits | undefined = await getZapSplits(store, await Conf.signer.getPublicKey());

  if (!zapSplit) {
    const dittoPubkey = '781a1527055f74c1f70230f10384609b34548f8ab6a0a6caa74025827f9fdae5';
    const dittoMsg = 'Official Ditto Account';

    const signer = Conf.signer;
    const event = await signer.signEvent({
      content: '',
      created_at: nostrNow(),
      kind: 30078,
      tags: [
        ['d', 'pub.ditto.zapSplits'],
        ['p', dittoPubkey, '5', dittoMsg],
      ],
    });

    await store.event(event);
  }
}
