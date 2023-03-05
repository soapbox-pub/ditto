import converter from 'npm:bech32-converting';

import { validator, z } from '@/deps.ts';

const createTokenSchema = z.object({
  password: z.string(),
});

const createTokenController = validator('json', (value, c) => {
  const result = createTokenSchema.safeParse(value);

  if (result.success) {
    const password = result.data.password;
    const token = password.startsWith('nsec1') ? converter('nsec').toHex(password).slice(2) : password;

    return c.json({
      access_token: token,
      token_type: 'Bearer',
      scope: 'read write follow push',
      created_at: Math.floor(new Date().getTime() / 1000),
    });
  } else {
    return c.json({ error: 'Invalid request' }, 400);
  }
});

export { createTokenController };
