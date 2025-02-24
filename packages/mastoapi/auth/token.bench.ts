import { generateToken, getTokenHash } from './token.ts';

Deno.bench('generateToken', async () => {
  await generateToken();
});

Deno.bench('getTokenHash', async (b) => {
  const { token } = await generateToken();
  b.start();
  await getTokenHash(token);
});
