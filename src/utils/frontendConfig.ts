import { NSchema as n, NStore } from '@nostrify/nostrify';

import { AdminSigner } from '@/signers/AdminSigner.ts';
import { Conf } from '@/config.ts';
import { configSchema, elixirTupleSchema, type PleromaConfig } from '@/schemas/pleroma-api.ts';

export async function getPleromaConfig(
  store: NStore,
  signal?: AbortSignal,
): Promise<undefined | Record<string, unknown>> {
  const configs = await getConfigs(store, signal ?? AbortSignal.timeout(1000));
  const frontendConfig = configs.find(({ group, key }) => group === ':pleroma' && key === ':frontend_configurations');
  if (frontendConfig) {
    const schema = elixirTupleSchema.transform(({ tuple }) => tuple).array();
    const data = schema.parse(frontendConfig.value).reduce<Record<string, unknown>>((result, [name, data]) => {
      result[name.replace(/^:/, '')] = data;
      return result;
    }, {});
    return data;
  }
  return undefined;
}

export async function getConfigs(store: NStore, signal: AbortSignal): Promise<PleromaConfig[]> {
  const { pubkey } = Conf;

  const [event] = await store.query([{
    kinds: [30078],
    authors: [pubkey],
    '#d': ['pub.ditto.pleroma.config'],
    limit: 1,
  }], { signal });

  try {
    const decrypted = await new AdminSigner().nip44.decrypt(Conf.pubkey, event.content);
    return n.json().pipe(configSchema.array()).catch([]).parse(decrypted);
  } catch (_e) {
    return [];
  }
}
