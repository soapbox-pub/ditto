import { assertEquals, assertThrows } from '@std/assert';

import { DittoConf } from './DittoConf.ts';

Deno.test('DittoConfig', async (t) => {
  const env = new Map<string, string>([
    ['DITTO_NSEC', 'nsec19shyxpuzd0cq2p5078fwnws7tyykypud6z205fzhlmlrs2vpz6hs83zwkw'],
  ]);

  const config = new DittoConf(env);

  await t.step('signer', async () => {
    assertEquals(
      await config.signer.getPublicKey(),
      '1ba0c5ed1bbbf3b7eb0d7843ba16836a0201ea68a76bafcba507358c45911ff6',
    );
  });
});

Deno.test('DittoConfig defaults', async (t) => {
  const env = new Map<string, string>();
  const config = new DittoConf(env);

  await t.step('signer throws', () => {
    assertThrows(() => config.signer);
  });

  await t.step('port', () => {
    assertEquals(config.port, 4036);
  });
});

Deno.test('DittoConfig with insecure media host', () => {
  const env = new Map<string, string>([
    ['LOCAL_DOMAIN', 'https://ditto.test'],
    ['MEDIA_DOMAIN', 'https://ditto.test'],
  ]);

  assertThrows(
    () => new DittoConf(env),
    Error,
    'For security reasons, MEDIA_DOMAIN cannot be on the same host as LOCAL_DOMAIN',
  );
});

Deno.test('DittoConfig with insecure media host and precheck disabled', () => {
  const env = new Map<string, string>([
    ['LOCAL_DOMAIN', 'https://ditto.test'],
    ['MEDIA_DOMAIN', 'https://ditto.test'],
    ['DITTO_PRECHECK', 'false'],
  ]);

  new DittoConf(env);
});
