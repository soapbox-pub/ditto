import { MiddlewareHandler } from '@hono/hono';
import { HTTPException } from '@hono/hono/http-exception';
import { NostrSigner } from '@nostrify/nostrify';
import { SetRequired } from 'type-fest';

/** Throw a 401 if a signer isn't set. */
export const requireSigner: MiddlewareHandler<{ Variables: { signer: NostrSigner } }> = async (c, next) => {
  if (!c.get('signer')) {
    throw new HTTPException(401, { message: 'No pubkey provided' });
  }

  await next();
};

/** Throw a 401 if a NIP-44 signer isn't set. */
export const requireNip44Signer: MiddlewareHandler<{ Variables: { signer: SetRequired<NostrSigner, 'nip44'> } }> =
  async (c, next) => {
    const signer = c.get('signer');

    if (!signer) {
      throw new HTTPException(401, { message: 'No pubkey provided' });
    }

    if (!signer.nip44) {
      throw new HTTPException(401, { message: 'No NIP-44 signer provided' });
    }

    await next();
  };
