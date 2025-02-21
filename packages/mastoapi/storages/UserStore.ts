import type {
  NostrEvent,
  NostrFilter,
  NostrRelayCLOSED,
  NostrRelayEOSE,
  NostrRelayEVENT,
  NRelay,
} from '@nostrify/nostrify';

interface UserStoreOpts {
  relay: NRelay;
  userPubkey: string;
  adminPubkey?: string;
}

export class UserStore implements NRelay {
  constructor(private opts: UserStoreOpts) {}

  req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    // TODO: support req maybe? It would be inefficient.
    return this.opts.relay.req(filters, opts);
  }

  async event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    return await this.opts.relay.event(event, opts);
  }

  /**
   * Query events that `pubkey` did not mute
   * https://github.com/nostr-protocol/nips/blob/master/51.md#standard-lists
   */
  async query(filters: NostrFilter[], opts: { signal?: AbortSignal; limit?: number } = {}): Promise<NostrEvent[]> {
    const { relay, userPubkey, adminPubkey } = this.opts;

    const mutes = new Set<string>();
    const [muteList] = await this.opts.relay.query([{ authors: [userPubkey], kinds: [10000], limit: 1 }]);

    for (const [name, value] of muteList?.tags ?? []) {
      if (name === 'p') {
        mutes.add(value);
      }
    }

    const events = await relay.query(filters, opts);

    const users = adminPubkey
      ? await relay.query([{
        kinds: [30382],
        authors: [adminPubkey],
        '#d': [...events.map(({ pubkey }) => pubkey)],
      }])
      : [];

    return events.filter((event) => {
      const user = users.find((user) => user.tags.find(([name]) => name === 'd')?.[1] === event.pubkey);

      for (const [name, value] of user?.tags ?? []) {
        if (name === 'n' && value === 'disabled') {
          return false;
        }
      }

      return event.kind === 0 || !mutes.has(event.pubkey);
    });
  }

  close(): Promise<void> {
    return this.opts.relay.close();
  }
}
