import { AppMiddleware } from '@/app.ts';
import { UserStore } from '@/storages/UserStore.ts';
import { Storages } from '@/storages.ts';

/** Store middleware. */
export const storeMiddleware: AppMiddleware = async (c, next) => {
  const pubkey = await c.get('signer')?.getPublicKey();

  if (pubkey) {
    const store = new UserStore(pubkey, await Storages.admin());
    c.set('store', store);
  } else {
    c.set('store', await Storages.admin());
  }
  await next();
};
