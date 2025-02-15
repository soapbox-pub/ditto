import { NSchema as n, NStore } from '@nostrify/nostrify';

import { Conf } from '@/config.ts';
import { configSchema } from '@/schemas/pleroma-api.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { PleromaConfigDB } from '@/utils/PleromaConfigDB.ts';

export async function getPleromaConfigs(store: NStore, signal?: AbortSignal): Promise<PleromaConfigDB> {
  const { pubkey } = Conf;

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
    const decrypted = await new AdminSigner().nip44.decrypt(Conf.pubkey, event.content);
    const configs = n.json().pipe(configSchema.array()).catch([]).parse(decrypted);
    return new PleromaConfigDB(configs);
  } catch (_e) {
    return new PleromaConfigDB([]);
  }
}
