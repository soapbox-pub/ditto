import type { Context } from '@/deps.ts';

function credentialsController(c: Context) {
  return c.json({});
}

export { credentialsController };
