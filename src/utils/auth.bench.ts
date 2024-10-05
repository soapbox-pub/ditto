import { generateToken, getTokenHash } from '@/utils/auth.ts';

Deno.bench('generateToken', async () => {
  await generateToken();
});

Deno.bench('getTokenHash', async (b) => {
  const { token } = await generateToken();
  b.start();
  await getTokenHash(token);
});
