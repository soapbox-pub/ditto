import { NostrEvent, NostrFilter, NStore } from '@nostrify/nostrify';

import { Conf } from '@/config.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { getTagSet } from '@/utils/tags.ts';

/** A store that prevents banned users from being displayed. */
export class AdminStore implements NStore {
  constructor(private store: NStore) {}

  async event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    return await this.store.event(event, opts);
  }

  async query(filters: NostrFilter[], opts: { signal?: AbortSignal; limit?: number } = {}): Promise<DittoEvent[]> {
    const events = await this.store.query(filters, opts);

    const users = await this.store.query([{
      kinds: [30382],
      authors: [Conf.pubkey],
      '#d': events.map((event) => event.pubkey),
      limit: 1,
    }]);

    return events.filter((event) => {
      const user = users.find(
        ({ kind, pubkey, tags }) =>
          kind === 30382 && pubkey === Conf.pubkey && tags.find(([name]) => name === 'd')?.[1] === event.pubkey,
      );

      const n = getTagSet(user?.tags ?? [], 'n');

      if (n.has('disabled') || n.has('suspended')) {
        return false;
      }

      return true;
    });
  }
}
