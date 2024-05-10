import { NostrEvent, NostrRelayOK, NPolicy, NStore } from '@nostrify/nostrify';

import { getTagSet } from '@/tags.ts';

export class MuteListPolicy implements NPolicy {
  constructor(private pubkey: string, private store: NStore) {
    this.store = store;
    this.pubkey = pubkey;
  }

  async call(event: NostrEvent): Promise<NostrRelayOK> {
    const allowEvent = ['OK', event.id, true, ''] as NostrRelayOK;
    const blockEvent = ['OK', event.id, false, 'You are banned in this server.'] as NostrRelayOK;

    const [muteList] = await this.store.query([{ authors: [this.pubkey], kinds: [10000], limit: 1 }]);
    if (!muteList) return allowEvent;

    const mutedPubkeys = getTagSet(muteList.tags, 'p');
    if (mutedPubkeys.has(event.pubkey)) return blockEvent;

    return allowEvent;
  }
}
