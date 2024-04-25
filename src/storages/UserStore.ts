import { NostrEvent, NostrFilter, NStore } from '@nostrify/nostrify';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { getTagSet } from '@/tags.ts';

export class UserStore implements NStore {
  private store: NStore;
  private pubkey: string;
  private muteList: Promise<DittoEvent | undefined>;

  constructor(pubkey: string, store: NStore) {
    this.pubkey = pubkey;
    this.store = store;
    this.muteList = this.getMuteList();
  }

  async event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    return await this.store.event(event, opts);
  }

  /**
   * Query events that `pubkey` did not block
   * https://github.com/nostr-protocol/nips/blob/master/51.md#standard-lists
   */
  async query(filters: NostrFilter[], opts: { signal?: AbortSignal; limit?: number } = {}): Promise<DittoEvent[]> {
    const allEvents = await this.store.query(filters, opts);

    const mutedPubkeysEvent = await this.muteList;
    if (!mutedPubkeysEvent) {
      return allEvents;
    }
    const mutedPubkeys = getTagSet(mutedPubkeysEvent.tags, 'p');

    return allEvents.filter((event) => {
      mutedPubkeys.has(event.pubkey) === false;
    });
  }

  private async getMuteList(): Promise<DittoEvent | undefined> {
    const [muteList] = await this.query([{ authors: [this.pubkey], kinds: [10000], limit: 1 }], {
      signal: AbortSignal.timeout(5000),
      limit: 1,
    });
    return muteList;
  }
}
