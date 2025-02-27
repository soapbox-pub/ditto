import { NSchema as n, NStore } from '@nostrify/nostrify';

import { configSchema } from '@/schemas/pleroma-api.ts';
import { PleromaConfigDB } from '@/utils/PleromaConfigDB.ts';

import type { DittoConf } from '@ditto/conf';

interface GetPleromaConfigsOpts {
  conf: DittoConf;
  relay: NStore;
  signal?: AbortSignal;
}

export async function getPleromaConfigs(opts: GetPleromaConfigsOpts): Promise<PleromaConfigDB> {
  const { conf, relay, signal } = opts;

  const signer = conf.signer;
  const pubkey = await signer.getPublicKey();

  const [event] = await relay.query([{
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
