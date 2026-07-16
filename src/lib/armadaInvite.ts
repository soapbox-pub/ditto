import { nip19, verifyEvent } from 'nostr-tools';
import { decrypt as nip44Decrypt } from 'nostr-tools/nip44';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import type { NostrEvent } from '@nostrify/nostrify';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/**
 * Armada / Concord encrypted community invite links.
 *
 * An invite is a URL in two parts (Concord CORD-05): a public locator in the
 * path — a bare NIP-19 `naddr` naming the addressable invite bundle
 * `(kind 33301, link_signer, d="")` — and a secret in the `#fragment` (an
 * unlock token + bootstrap relays, base64url). The bundle's `content` is
 * NIP-44 encrypted and its unlock key lives ONLY in the fragment, so Ditto
 * can never render it as a plain event.
 *
 * Ditto is not an encrypted-community client, so it can't join or preview
 * these. But it should recognize the link and offer to open it in Armada,
 * rather than fetching the bundle and rendering encrypted gibberish (or a
 * bare "unsupported kind" tombstone) through the generic naddr embed.
 */

/** The addressable invite bundle kind (Concord CORD-05 §1). */
export const INVITE_BUNDLE_KIND = 33301;

/** Web app that can open these invites. The path base is cosmetic per CORD-05. */
const ARMADA_INVITE_BASE = 'https://armada.buzz/invite/';

/** The `…/invite/<naddr>` path prefix used by Armada links. */
const INVITE_PATH_PREFIX = '/invite/';

export interface ArmadaInvite {
  /** The bare invite-bundle naddr (locator, no fragment). */
  naddr: string;
  /** The link signer's pubkey (hex) — the bundle coordinate's author. */
  linkSigner: string;
  /** The `#fragment` secret, without the leading `#`. Empty if the link dropped it. */
  fragment: string;
  /** A canonical https URL that opens the invite in Armada. */
  openUrl: string;
  /** True when the link is missing its `#fragment` and therefore can't be joined. */
  missingSecret: boolean;
}

/** Decode a bare naddr into its link-signer pubkey, or undefined if it isn't an invite bundle. */
function naddrToSigner(naddr: string): string | undefined {
  try {
    const decoded = nip19.decode(naddr);
    if (decoded.type !== 'naddr') return undefined;
    if (decoded.data.kind !== INVITE_BUNDLE_KIND || decoded.data.identifier !== '') return undefined;
    return decoded.data.pubkey;
  } catch {
    return undefined;
  }
}

/**
 * Parse a community invite from a full URL (`…/invite/<naddr>#<fragment>`) or a
 * bare `naddr#fragment`. Returns `undefined` for anything that isn't
 * recognizably an invite-bundle link, so callers can fall through to the
 * generic naddr embed.
 */
export function parseArmadaInvite(input: string): ArmadaInvite | undefined {
  const trimmed = input.trim();

  let naddr: string | undefined;
  let fragment = '';

  if (/^naddr1[023456789acdefghjklmnpqrstuvwxyz]+/i.test(trimmed)) {
    const [head, ...rest] = trimmed.split('#');
    naddr = head;
    fragment = rest.join('#');
  } else {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return undefined;
    }
    if (!url.pathname.startsWith(INVITE_PATH_PREFIX)) return undefined;
    naddr = decodeURIComponent(url.pathname.slice(INVITE_PATH_PREFIX.length)).replace(/\/$/, '');
    fragment = url.hash.replace(/^#/, '');
  }

  if (!naddr) return undefined;
  const linkSigner = naddrToSigner(naddr);
  if (!linkSigner) return undefined;

  const openUrl = sanitizeUrl(`${ARMADA_INVITE_BASE}${naddr}${fragment ? `#${fragment}` : ''}`);
  if (!openUrl) return undefined;

  return { naddr, linkSigner, fragment, openUrl, missingSecret: fragment.length === 0 };
}

/** Whether `input` is a community invite link (with or without its `#fragment`). */
export function isArmadaInvite(input: string): boolean {
  return parseArmadaInvite(input) !== undefined;
}

// ── Bundle preview (CORD-05 §3 fragment codec + §1 bundle) ───────────────────
//
// The bundle content is NIP-44-encrypted under a symmetric key derived from
// the fragment's unlock token. Ditto can't join an encrypted community, but
// with the token it CAN decrypt the bundle's public preview (name, icon,
// channel list) to render an informative invite card — the same preview
// Armada shows before you accept.

const TOKEN_BYTES = 16;
const MAX_BOOTSTRAP_RELAYS = 3;
const FRAGMENT_VERSION = 4;
const FLAG_STOCK_SET = 0x01;

/** The stock relay dictionary (generation 4) both Vector and Soapbox ship. */
const RELAY_DICTIONARY: Record<number, string> = {
  1: 'wss://jskitty.com/nostr',
  2: 'wss://asia.vectorapp.io/nostr',
  3: 'wss://relay.ditto.pub',
  4: 'wss://relay.dreamith.to',
};
const STOCK_RELAYS: string[] = [1, 2, 3, 4].map((i) => RELAY_DICTIONARY[i]);

/** An encrypted-blob pointer (icon) — the media host stores AES-256-GCM ciphertext. */
export interface ArmadaImagePointer {
  url: string;
  /** Hex AES-256-GCM key. */
  key: string;
  /** Hex AES-GCM nonce/IV. */
  nonce: string;
  /** Hex SHA-256 of the plaintext (integrity check). */
  hash: string;
}

/** The decrypted invite bundle's public preview fields (CORD-05 §1). */
export interface ArmadaInvitePreview {
  name: string;
  icon?: ArmadaImagePointer;
  channelCount: number;
  /** Bootstrap relays carried by the bundle (post-join, informational). */
  relays: string[];
  /** True once past the bundle's optional `expires_at`. */
  expired: boolean;
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Decode an invite fragment into its unlock token + bootstrap relays (CORD-05 §3). */
export function decodeInviteFragment(fragment: string): { token: Uint8Array; relays: string[] } | undefined {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(fragment.trim());
  } catch {
    return undefined;
  }
  let o = 0;
  const need = (n: number) => o + n <= bytes.length;
  if (!need(2)) return undefined;
  const version = bytes[o++];
  // Only the current generation is understood; older/newer decode against the
  // wrong dictionary, so bail (the card still offers "open in Armada").
  if (version !== FRAGMENT_VERSION) return undefined;
  const flags = bytes[o++];

  const relays: string[] = [];
  if (flags & FLAG_STOCK_SET) {
    relays.push(...STOCK_RELAYS);
  } else {
    if (!need(1)) return undefined;
    const count = bytes[o++];
    if (count > MAX_BOOTSTRAP_RELAYS) return undefined;
    const decoder = new TextDecoder();
    for (let i = 0; i < count; i++) {
      if (!need(1)) return undefined;
      const lead = bytes[o++];
      if (lead >= 1 && lead <= 254) {
        const url = RELAY_DICTIONARY[lead];
        if (url) relays.push(url); // unknown id is skipped, not fatal
      } else {
        if (!need(1)) return undefined;
        const len = bytes[o++];
        if (!need(len)) return undefined;
        const text = decoder.decode(bytes.slice(o, o + len));
        o += len;
        relays.push(lead === 255 ? text : `wss://${text}`);
      }
    }
  }

  if (!need(TOKEN_BYTES)) return undefined;
  const token = bytes.slice(o, o + TOKEN_BYTES);
  o += TOKEN_BYTES;
  if (o !== bytes.length) return undefined;
  return { token, relays };
}

/**
 * The public-invite bundle decrypt key, derived from the link's unlock token
 * (Concord derive.ts §A): `HKDF-SHA256(token, info="concord/invite-key"‖0x00‖ZERO32)`.
 */
function inviteBundleKey(token: Uint8Array): Uint8Array {
  const label = new TextEncoder().encode('concord/invite-key');
  const info = new Uint8Array(label.length + 1 + 32); // label ‖ 0x00 ‖ 32-byte zero id
  info.set(label, 0);
  // info[label.length] = 0x00 (separator) — already zero-filled
  // the trailing 32 bytes are the ZERO32 scope id — already zero-filled
  return hkdf(sha256, token, new Uint8Array(0), info, 32);
}

const VSK_INVITE_LIVE = '6';

/**
 * Verify + decrypt a fetched invite-bundle event into its public preview.
 * `expectedSigner` is the naddr's author; we re-check the signature/author to
 * reject a relay handing back garbage. Returns undefined for a tombstone, a
 * bad signature, a wrong author, or a token that doesn't decrypt.
 */
export function decodeInviteBundle(
  event: NostrEvent,
  expectedSigner: string,
  token: Uint8Array,
): ArmadaInvitePreview | undefined {
  if (event.kind !== INVITE_BUNDLE_KIND || event.pubkey !== expectedSigner) return undefined;
  const vsk = event.tags.find((t) => t[0] === 'vsk')?.[1];
  if (vsk !== VSK_INVITE_LIVE) return undefined; // revoked or unknown marker
  if (!verifyEvent(event)) return undefined;

  let bundle: Record<string, unknown>;
  try {
    bundle = JSON.parse(nip44Decrypt(event.content, inviteBundleKey(token)));
  } catch {
    return undefined;
  }
  if (!bundle || typeof bundle !== 'object') return undefined;

  const name = typeof bundle.name === 'string' ? bundle.name : '';
  const channels = Array.isArray(bundle.channels) ? bundle.channels : [];
  const relays = Array.isArray(bundle.relays) ? bundle.relays.filter((r): r is string => typeof r === 'string') : [];
  const expiresAt = typeof bundle.expires_at === 'number' ? bundle.expires_at : undefined;
  const icon = isImagePointer(bundle.icon) ? bundle.icon : undefined;

  return {
    name,
    icon,
    channelCount: channels.length,
    relays: relays.slice(0, MAX_BOOTSTRAP_RELAYS),
    expired: typeof expiresAt === 'number' && Date.now() > expiresAt,
  };
}

function isImagePointer(v: unknown): v is ArmadaImagePointer {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.url === 'string' &&
    typeof o.key === 'string' &&
    typeof o.nonce === 'string' &&
    typeof o.hash === 'string'
  );
}
