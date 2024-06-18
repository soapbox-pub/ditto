import { HTTPException } from '@hono/hono/http-exception';

import { AppMiddleware } from '@/app.ts';

/** Throw a 401 if a signer isn't set. */
export const requireSigner: AppMiddleware = async (c, next) => {
  if (!c.get('signer')) {
    throw new HTTPException(401, { message: 'No pubkey provided' });
  }

  await next();
};
