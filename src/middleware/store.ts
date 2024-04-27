import { AppMiddleware } from '@/app.ts';
import { UserStore } from '@/storages/UserStore.ts';
import { eventsDB } from '@/storages.ts';

/** Store middleware. */
const storeMiddleware: AppMiddleware = async (c, next) => {
  const pubkey = c.get('pubkey') as string;

  if (pubkey) {
    const store = new UserStore(pubkey, eventsDB);
    c.set('store', store);
  } else {
    c.set('store', eventsDB);
  }
  await next();
};

export { storeMiddleware };
