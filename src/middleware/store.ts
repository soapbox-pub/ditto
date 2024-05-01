import { AppMiddleware } from '@/app.ts';
import { UserStore } from '@/storages/UserStore.ts';
import { getAdminStore } from '@/storages/adminStore.ts';

/** Store middleware. */
const storeMiddleware: AppMiddleware = async (c, next) => {
  const pubkey = c.get('pubkey');
  const adminStore = getAdminStore();
  if (pubkey) {
    const store = new UserStore(pubkey, adminStore);
    c.set('store', store);
  } else {
    c.set('store', adminStore);
  }
  await next();
};

export { storeMiddleware };
