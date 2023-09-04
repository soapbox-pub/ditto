import { type AppController } from '@/app.ts';
import * as eventsDB from '@/db/events.ts';
import { z } from '@/deps.ts';
import { configSchema, elixirTupleSchema } from '@/schemas/pleroma-api.ts';
import { createAdminEvent } from '@/utils/web.ts';
import { Conf } from '@/config.ts';

const frontendConfigController: AppController = async (c) => {
  const [event] = await eventsDB.getFilters([{
    kinds: [30078],
    authors: [Conf.pubkey],
    '#d': ['pub.ditto.frontendConfig'],
    limit: 1,
  }]);

  if (event) {
    const data = JSON.parse(event.content);
    return c.json(data);
  }

  return c.json({});
};

/** Pleroma admin config controller. */
const updateConfigController: AppController = async (c) => {
  const json = await c.req.json();
  const { configs } = z.object({ configs: z.array(configSchema) }).parse(json);

  for (const { group, key, value } of configs) {
    if (group === ':pleroma' && key === ':frontend_configurations') {
      const schema = elixirTupleSchema.transform(({ tuple }) => tuple).array();

      const data = schema.parse(value).reduce<Record<string, unknown>>((result, [name, data]) => {
        result[name.replace(/^:/, '')] = data;
        return result;
      }, {});

      await createAdminEvent({
        kind: 30078,
        content: JSON.stringify(data),
        tags: [['d', 'pub.ditto.frontendConfig']],
      }, c);
    }
  }

  return c.json([]);
};

export { frontendConfigController, updateConfigController };
