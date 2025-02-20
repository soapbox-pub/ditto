import { NSchema as n, NStore } from '@nostrify/nostrify';

import { Conf } from '@/config.ts';
import { configSchema } from '@/schemas/pleroma-api.ts';
import { PleromaConfigDB } from '@/utils/PleromaConfigDB.ts';

export async function getPleromaConfigs(store: NStore, signal?: AbortSignal): Promise<PleromaConfigDB> {
  const signer = Conf.signer;
  const pubkey = await signer.getPublicKey();

  const [event] = await store.query([{
    kinds: [30078],
    authors: [pubkey],
    '#d': ['pub.ditto.pleroma.config'],
    limit: 1,
  }], { signal });

  if (!event) {
    return new PleromaConfigDB([]);
  }

  try {
    const decrypted = await signer.nip44.decrypt(pubkey, event.content);
    const configs = n.json().pipe(configSchema.array()).catch([]).parse(decrypted);
    return new PleromaConfigDB(configs);
  } catch (_e) {
    return new PleromaConfigDB([]);
  }
}
