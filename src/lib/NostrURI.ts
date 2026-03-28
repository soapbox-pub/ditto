import { nip19 } from 'nostr-tools';

/**
 * Represents a parsed Nostr URI with its components
 */
export interface NostrURIParts {
  /** The public key (hex format) */
  pubkey: string;
  /** The identifier (d-tag value) */
  identifier: string;
  /** Optional relay URL */
  relay?: string;
}

/**
 * NostrURI class for constructing Nostr clone URIs for git repositories.
 *
 * Produces URIs in the format:
 * - nostr://npub/identifier
 * - nostr://npub/relay-hostname/identifier
 *
 * Ported from Shakespeare (src/lib/NostrURI.ts).
 *
 * @example
 * ```ts
 * const uri = new NostrURI({
 *   pubkey: 'abc123...',
 *   identifier: 'my-repo',
 *   relay: 'wss://relay.example.com/'
 * });
 * console.log(uri.toString()); // 'nostr://npub1.../relay.example.com/my-repo'
 * ```
 */
export class NostrURI {
  public readonly pubkey: string;
  public readonly identifier: string;
  public readonly relay?: string;

  constructor(parts: NostrURIParts) {
    this.pubkey = parts.pubkey;
    this.identifier = parts.identifier;
    this.relay = parts.relay;
  }

  /**
   * Construct a NostrURI from a kind 30617 git repository event.
   * Extracts the pubkey, d-tag, and first relay from the event.
   */
  static fromEvent(event: { pubkey: string; tags: string[][] }): NostrURI {
    const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    const relays = event.tags.find(([n]) => n === 'relays');
    const relay = relays?.[1]; // First relay URL

    return new NostrURI({
      pubkey: event.pubkey,
      identifier: dTag,
      relay,
    });
  }

  /**
   * Create a NostrURI from an naddr (NIP-19 addressable event identifier).
   */
  static fromNaddr(naddr: string): NostrURI {
    const decoded = nip19.decode(naddr);

    if (decoded.type !== 'naddr') {
      throw new Error('Invalid naddr: must be an addressable event pointer');
    }

    const data = decoded.data;

    return new NostrURI({
      pubkey: data.pubkey,
      identifier: data.identifier,
      relay: data.relays?.[0],
    });
  }

  /**
   * Convert to a `nostr://` URI string.
   *
   * The relay hostname is included between the npub and identifier
   * when a relay URL is available, with the `wss://` scheme stripped.
   */
  toString(): string {
    const npub = nip19.npubEncode(this.pubkey);

    if (this.relay) {
      try {
        const url = new URL(this.relay);
        return `nostr://${npub}/${url.hostname}/${this.identifier}`;
      } catch {
        // fallthrough
      }
    }

    return `nostr://${npub}/${this.identifier}`;
  }

  /**
   * Convert to an naddr (NIP-19 addressable event identifier) for kind 30617.
   */
  toNaddr(): string {
    const data: {
      kind: number;
      pubkey: string;
      identifier: string;
      relays?: string[];
    } = {
      kind: 30617,
      pubkey: this.pubkey,
      identifier: this.identifier,
    };

    if (this.relay) {
      data.relays = [this.relay];
    }

    return nip19.naddrEncode(data);
  }

  toJSON(): NostrURIParts {
    return {
      pubkey: this.pubkey,
      identifier: this.identifier,
      relay: this.relay,
    };
  }
}
