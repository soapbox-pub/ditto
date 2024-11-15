import { assertEquals } from '@std/assert';

import data from '~/fixtures/config-db.json' with { type: 'json' };

import { PleromaConfig } from '@/schemas/pleroma-api.ts';
import { PleromaConfigDB } from '@/utils/PleromaConfigDB.ts';

Deno.test('PleromaConfigDB.getIn', () => {
  const configDB = new PleromaConfigDB(data.configs as PleromaConfig[]);

  assertEquals(
    configDB.get(':pleroma', ':frontend_configurations')?.value,
    configDB.getIn(':pleroma', ':frontend_configurations'),
  );

  assertEquals(configDB.getIn(':pleroma', ':frontend_configurations', ':bleroma'), undefined);

  assertEquals(
    configDB.getIn(':pleroma', ':frontend_configurations', ':soapbox_fe', 'colors', 'primary', '500'),
    '#1ca82b',
  );

  assertEquals(
    configDB.getIn(':pleroma', ':frontend_configurations', ':soapbox_fe', 'colors', 'primary', '99999999'),
    undefined,
  );
});
