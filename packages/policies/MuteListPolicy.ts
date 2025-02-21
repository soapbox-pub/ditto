import type { NostrEvent, NostrRelayOK, NPolicy, NStore } from '@nostrify/nostrify';

export class MuteListPolicy implements NPolicy {
  constructor(private pubkey: string, private store: NStore) {}

  async call(event: NostrEvent): Promise<NostrRelayOK> {
    const pubkeys = new Set<string>();

    const [muteList] = await this.store.query([{ authors: [this.pubkey], kinds: [10000], limit: 1 }]);

    for (const [name, value] of muteList?.tags ?? []) {
      if (name === 'p') {
        pubkeys.add(value);
      }
    }

    if (pubkeys.has(event.pubkey)) {
      return ['OK', event.id, false, 'blocked: account blocked'];
    }

    return ['OK', event.id, true, ''];
  }
}
