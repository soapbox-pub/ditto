import { AppMiddleware } from '@/app.ts';
import { UserStore } from '@/storages/UserStore.ts';
import { eventsDB } from '@/storages.ts';
import { HTTPException } from 'hono';

/** User Store middleware.
 *  Throw a 500 if can't set the `userStore` */
const setUserStore: AppMiddleware = async (c, next) => {
  const pubkey = c.get('pubkey') as string;

  try {
    const store = new UserStore(pubkey, eventsDB);
    c.set('userStore', store);
  } catch (e) {
    console.log(e);
    throw new HTTPException(500);
  }

  await next();
};

export { setUserStore };
