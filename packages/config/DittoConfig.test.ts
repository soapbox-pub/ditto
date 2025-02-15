import { assertEquals, assertThrows } from '@std/assert';

import { DittoConfig } from './DittoConfig.ts';

Deno.test('DittoConfig', async (t) => {
  const env = new Map<string, string>([
    ['DITTO_NSEC', 'nsec19shyxpuzd0cq2p5078fwnws7tyykypud6z205fzhlmlrs2vpz6hs83zwkw'],
  ]);

  const config = new DittoConfig(env);

  await t.step('nsec', () => {
    assertEquals(config.nsec, 'nsec19shyxpuzd0cq2p5078fwnws7tyykypud6z205fzhlmlrs2vpz6hs83zwkw');
  });

  await t.step('pubkey', () => {
    assertEquals(config.pubkey, '1ba0c5ed1bbbf3b7eb0d7843ba16836a0201ea68a76bafcba507358c45911ff6');
  });
});

Deno.test('DittoConfig defaults', async (t) => {
  const env = new Map<string, string>();
  const config = new DittoConfig(env);

  await t.step('nsec throws', () => {
    assertThrows(() => config.nsec);
  });

  await t.step('port', () => {
    assertEquals(config.port, 4036);
  });
});
