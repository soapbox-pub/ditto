import { NostrEvent, NostrRelayOK, NPolicy, NStore } from '@nostrify/nostrify';

import { getTagSet } from '@/tags.ts';

export class MuteListPolicy implements NPolicy {
  constructor(private pubkey: string, private store: NStore) {}

  async call(event: NostrEvent): Promise<NostrRelayOK> {
    const [muteList] = await this.store.query([{ authors: [this.pubkey], kinds: [10000], limit: 1 }]);
    const pubkeys = getTagSet(muteList?.tags ?? [], 'p');

    if (pubkeys.has(event.pubkey)) {
      return ['OK', event.id, false, 'You are banned in this server.'];
    }

    return ['OK', event.id, true, ''];
  }
}
