import { NostrEvent, NostrRelayOK, NPolicy, NStore } from '@nostrify/nostrify';

import { getTagSet } from '@/tags.ts';

export class MuteListPolicy implements NPolicy {
  constructor(private pubkey: string, private store: NStore) {}

  async call(event: NostrEvent): Promise<NostrRelayOK> {
    const allowEvent: NostrRelayOK = ['OK', event.id, true, ''];
    const blockEvent: NostrRelayOK = ['OK', event.id, false, 'You are banned in this server.'];

    const [muteList] = await this.store.query([{ authors: [this.pubkey], kinds: [10000], limit: 1 }]);
    if (!muteList) return allowEvent;

    const mutedPubkeys = getTagSet(muteList.tags, 'p');
    if (mutedPubkeys.has(event.pubkey)) return blockEvent;

    return allowEvent;
  }
}
