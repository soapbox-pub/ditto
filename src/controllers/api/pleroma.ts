import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { decryptAdmin, encryptAdmin } from '@/crypto.ts';
import { z } from '@/deps.ts';
import { configSchema, elixirTupleSchema } from '@/schemas/pleroma-api.ts';
import { eventsDB } from '@/storages.ts';
import { createAdminEvent } from '@/utils/api.ts';
import { jsonSchema } from '@/schema.ts';

const frontendConfigController: AppController = async (c) => {
  const [event] = await eventsDB.filter([{
    kinds: [30078],
    authors: [Conf.pubkey],
    '#d': ['pub.ditto.pleroma.config'],
    limit: 1,
  }]);

  const configs = jsonSchema.pipe(z.array(configSchema)).parse(
    event?.content ? await decryptAdmin(Conf.pubkey, event.content) : [],
  );

  const frontendConfig = configs.find(({ group, key }) => group === ':pleroma' && key === ':frontend_configurations');

  if (frontendConfig) {
    const schema = elixirTupleSchema.transform(({ tuple }) => tuple).array();
    const data = schema.parse(frontendConfig.value).reduce<Record<string, unknown>>((result, [name, data]) => {
      result[name.replace(/^:/, '')] = data;
      return result;
    }, {});
    return c.json(data);
  } else {
    return c.json({});
  }
};

/** Pleroma admin config controller. */
const updateConfigController: AppController = async (c) => {
  const { pubkey } = Conf;

  const [event] = await eventsDB.filter([{
    kinds: [30078],
    authors: [pubkey],
    '#d': ['pub.ditto.pleroma.config'],
    limit: 1,
  }]);

  const configs = jsonSchema.pipe(z.array(configSchema)).parse(
    event?.content ? await decryptAdmin(pubkey, event.content) : [],
  );

  const { configs: newConfigs } = z.object({ configs: z.array(configSchema) }).parse(await c.req.json());

  for (const { group, key, value } of newConfigs) {
    const index = configs.findIndex((c) => c.group === group && c.key === key);
    if (index === -1) {
      configs.push({ group, key, value });
    } else {
      configs[index].value = value;
    }
  }

  await createAdminEvent({
    kind: 30078,
    content: await encryptAdmin(pubkey, JSON.stringify(configs)),
    tags: [['d', 'pub.ditto.pleroma.config']],
  }, c);

  return c.json({ configs: newConfigs, need_reboot: false });
};

export { frontendConfigController, updateConfigController };
