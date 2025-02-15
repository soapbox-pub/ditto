import { assertEquals } from '@std/assert';

import { getEcdsaPublicKey } from './crypto.ts';

Deno.test('getEcdsaPublicKey', async () => {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    ['sign', 'verify'],
  );

  const result = await getEcdsaPublicKey(privateKey, true);

  assertKeysEqual(result, publicKey);
});

/** Assert that two CryptoKey objects are equal by value. Keys must be exportable. */
async function assertKeysEqual(a: CryptoKey, b: CryptoKey): Promise<void> {
  const [jwk1, jwk2] = await Promise.all([
    crypto.subtle.exportKey('jwk', a),
    crypto.subtle.exportKey('jwk', b),
  ]);

  assertEquals(jwk1, jwk2);
}
