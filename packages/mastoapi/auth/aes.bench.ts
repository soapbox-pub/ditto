import { generateSecretKey } from 'nostr-tools';

import { aesDecrypt, aesEncrypt } from './aes.ts';

Deno.bench('aesEncrypt', async (b) => {
  const sk = generateSecretKey();
  const decrypted = generateSecretKey();
  b.start();
  await aesEncrypt(sk, decrypted);
});

Deno.bench('aesDecrypt', async (b) => {
  const sk = generateSecretKey();
  const decrypted = generateSecretKey();
  const encrypted = await aesEncrypt(sk, decrypted);
  b.start();
  await aesDecrypt(sk, encrypted);
});
