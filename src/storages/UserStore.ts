import { NostrEvent, NostrFilter, NStore } from '@nostrify/nostrify';

import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { getTagSet } from '@/tags.ts';

export class UserStore implements NStore {
  constructor(private pubkey: string, private store: NStore) {}

  async event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    return await this.store.event(event, opts);
  }

  /**
   * Query events that `pubkey` did not mute
   * https://github.com/nostr-protocol/nips/blob/master/51.md#standard-lists
   */
  async query(filters: NostrFilter[], opts: { signal?: AbortSignal; limit?: number } = {}): Promise<DittoEvent[]> {
    const events = await this.store.query(filters, opts);
    const pubkeys = await this.getMutedPubkeys();

    return events.filter((event) => {
      return event.kind === 0 || !pubkeys.has(event.pubkey);
    });
  }

  private async getMuteList(): Promise<DittoEvent | undefined> {
    const [muteList] = await this.store.query([{ authors: [this.pubkey], kinds: [10000], limit: 1 }]);
    return muteList;
  }

  private async getMutedPubkeys(): Promise<Set<string>> {
    const mutedPubkeysEvent = await this.getMuteList();
    if (!mutedPubkeysEvent) {
      return new Set();
    }
    return getTagSet(mutedPubkeysEvent.tags, 'p');
  }
}
