import { AppMiddleware } from '@/app.ts';
import { Conf } from '@/config.ts';
import { UserStore } from '@/storages/UserStore.ts';
import { eventsDB } from '@/storages.ts';

/** Store middleware. */
const storeMiddleware: AppMiddleware = async (c, next) => {
  const pubkey = c.get('pubkey');
  const adminStore = new UserStore(Conf.pubkey, eventsDB);

  if (pubkey) {
    const store = new UserStore(pubkey, adminStore);
    c.set('store', store);
  } else {
    c.set('store', adminStore);
  }
  await next();
};

export { storeMiddleware };
