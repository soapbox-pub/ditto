import { NostrEvent, NostrFilter, NStore } from '@nostrify/nostrify';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { getTagSet } from '@/tags.ts';

export class UserStore implements NStore {
  store: NStore;
  pubkey: string;
  #muteList: Promise<DittoEvent>;

  constructor(pubkey: string, store: NStore) {
    this.pubkey = pubkey;
    this.store = store;
    this.#muteList = this.#getMuteList();
  }

  async event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    return await this.store.event(event, opts);
  }

  /** Query events that `pubkey` did not block */
  async query(filters: NostrFilter[], opts: { signal?: AbortSignal; limit?: number } = {}): Promise<DittoEvent[]> {
    const allEvents = await this.store.query(filters, opts);

    const blockedUsers = getTagSet((await this.#muteList).tags, 'p');

    return allEvents.filter((event) => {
      blockedUsers.has(event.pubkey) === false;
    });
  }

  async #getMuteList(): Promise<DittoEvent> {
    const [muteList] = await this.query([{ authors: [this.pubkey], kinds: [10000], limit: 1 }], {
      signal: AbortSignal.timeout(5000),
      limit: 1,
    });
    return muteList;
  }
}
