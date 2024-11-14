import { assertEquals } from '@std/assert';

import data from '~/fixtures/config-db.json' with { type: 'json' };

import { PleromaConfig } from '@/schemas/pleroma-api.ts';
import { PleromaConfigDB } from '@/utils/PleromaConfigDB.ts';

Deno.test('PleromaConfigDB', () => {
  const configs = new PleromaConfigDB(data.configs as PleromaConfig[]);

  const frontendConfigurations = configs.get(':pleroma', ':frontend_configurations');

  assertEquals((frontendConfigurations as any).value[1].tuple[0], ':soapbox_fe');
});
