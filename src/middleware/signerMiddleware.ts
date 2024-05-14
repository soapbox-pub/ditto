import { AppMiddleware } from '@/app.ts';
import { APISigner } from '@/signers/APISigner.ts';

/** Make a `signer` object available to all controllers, or unset if the user isn't logged in. */
export const signerMiddleware: AppMiddleware = async (c, next) => {
  try {
    c.set('signer', new APISigner(c));
  } catch {
    // do nothing
  }

  await next();
};
