import { assertEquals } from '@std/assert';
import { encodeHex } from '@std/encoding/hex';
import { generateSecretKey } from 'nostr-tools';

import { aesDecrypt, aesEncrypt } from './aes.ts';

Deno.test('aesDecrypt & aesEncrypt', async () => {
  const sk = generateSecretKey();
  const data = generateSecretKey();

  const encrypted = await aesEncrypt(sk, data);
  const decrypted = await aesDecrypt(sk, encrypted);

  assertEquals(encodeHex(decrypted), encodeHex(data));
});
