import { UserStore } from '@/storages/UserStore.ts';
import { Conf } from '@/config.ts';
import { eventsDB } from '@/storages.ts';

export function getAdminStore() {
  return new UserStore(Conf.pubkey, eventsDB);
}
