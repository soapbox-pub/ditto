import { generateSecretKey } from 'nostr-tools';

import { decryptSecretKey, encryptSecretKey, generateToken, getTokenHash } from '@/utils/auth.ts';

Deno.bench('generateToken', async () => {
  await generateToken();
});

Deno.bench('getTokenHash', async (b) => {
  const { token } = await generateToken();
  b.start();
  await getTokenHash(token);
});

Deno.bench('encryptSecretKey', async (b) => {
  const sk = generateSecretKey();
  const decrypted = generateSecretKey();
  b.start();
  await encryptSecretKey(sk, decrypted);
});

Deno.bench('decryptSecretKey', async (b) => {
  const sk = generateSecretKey();
  const decrypted = generateSecretKey();
  const encrypted = await encryptSecretKey(sk, decrypted);
  b.start();
  await decryptSecretKey(sk, encrypted);
});
