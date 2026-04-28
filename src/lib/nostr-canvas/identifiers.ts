/**
 * Helpers for nostr-canvas tile identifiers (`<nip05>:<name>`).
 *
 * Per the nostr-canvas NIP, tile `d` tags MUST follow the pattern
 * `<nip05>:<name>`, where the NIP-05 prefix namespaces the tile to its
 * author. Clients SHOULD verify the NIP-05 portion against the event
 * `pubkey` and hide unverified tiles from discovery.
 */

import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

/** Pattern allowed inside the slug portion of a tile identifier. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Pattern allowed for NIP-05 address portion. */
const NIP05_RE = /^[a-z0-9._-]+@[a-z0-9.-]+$/i;

/**
 * Return the `d` tag value from an event, or undefined if missing.
 */
export function getDTag(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === 'd')?.[1];
}

/**
 * Split a tile identifier into its NIP-05 address and slug parts.
 * Returns `null` for malformed identifiers.
 *
 * Tolerates a leading `@` on the NIP-05 portion (e.g.
 * `@alice@nostr.com:weather` is parsed as `nip05="alice@nostr.com"`,
 * `slug="weather"`). The spec requires no leading `@`, but some tile
 * authors write the identifier in its "display" form; accepting it
 * avoids surprising users with ghost-hidden tiles.
 */
export function parseTileIdentifier(
  identifier: string,
): { nip05: string; slug: string } | null {
  const colon = identifier.indexOf(':');
  if (colon === -1) return null;
  const rawNip05 = identifier.slice(0, colon);
  const slug = identifier.slice(colon + 1);
  const nip05 = rawNip05.startsWith('@') ? rawNip05.slice(1) : rawNip05;
  if (!nip05 || !slug) return null;
  return { nip05, slug };
}

/**
 * Verify that a tile event's `d`-tag NIP-05 prefix matches the author's
 * verified NIP-05 in their kind-0 metadata.
 *
 * Returns false when the tile is missing a `d` tag, when the `d` tag
 * isn't in `<nip05>:<name>` form, or when the NIP-05 prefix doesn't
 * match the author metadata. Returns `true` only when the prefix
 * matches the `metadata.nip05` case-insensitively.
 *
 * Note: this does NOT itself perform the NIP-05 HTTPS check. Ditto
 * already verifies NIP-05 → pubkey elsewhere (see `useAuthor`). This
 * helper only ensures the tile author advertises a matching NIP-05
 * in their profile.
 */
export function verifyTileDTag(
  event: NostrEvent,
  metadata: NostrMetadata | undefined | null,
): boolean {
  const d = getDTag(event);
  if (!d) return false;
  const parts = parseTileIdentifier(d);
  if (!parts) return false;
  if (!NIP05_RE.test(parts.nip05)) return false;
  const claim = metadata?.nip05;
  if (!claim) return false;
  return claim.toLowerCase() === parts.nip05.toLowerCase();
}

/**
 * Classify a tile event against its author's metadata, for Browse-tab
 * display purposes.
 *
 * - `malformed` — the event has no `d` tag, or the `d` tag isn't in
 *   `<nip05>:<slug>` form. These tiles are unloadable; hide them.
 * - `unverified` — the `d` tag is well-formed but the author's kind-0
 *   metadata doesn't advertise a matching `nip05`. Show the tile but
 *   flag it with a warning so the user knows the identifier isn't
 *   backed by a claim the author made.
 * - `verified` — the `d` tag's NIP-05 prefix matches the author's
 *   kind-0 `nip05` claim.
 */
export type TileVerification = 'malformed' | 'unverified' | 'verified';

export function tileVerificationState(
  event: NostrEvent,
  metadata: NostrMetadata | undefined | null,
): TileVerification {
  const d = getDTag(event);
  if (!d) return 'malformed';
  const parts = parseTileIdentifier(d);
  if (!parts) return 'malformed';
  if (!NIP05_RE.test(parts.nip05)) return 'malformed';
  const claim = metadata?.nip05;
  if (typeof claim === 'string' && claim.toLowerCase() === parts.nip05.toLowerCase()) {
    return 'verified';
  }
  return 'unverified';
}

/**
 * Build a short pubkey suffix used for local-only draft tile identifiers.
 * We use the first 12 hex chars of the pubkey → 6 bytes of entropy — enough
 * for uniqueness among a user's own drafts.
 */
function shortPubkeyTag(pubkey: string): string {
  return pubkey.slice(0, 12);
}

/**
 * Produce a stable, per-user, **local-only** tile identifier that lets a
 * user install a draft tile before they've registered a NIP-05. The format
 * is `<pubkey12>@local:<slug>` — the fake `@local` domain passes the
 * `parseTileDefEvent` identifier validation (which requires an `@` before
 * the colon) while the `.local` TLD makes it syntactically impossible to
 * confuse with a real NIP-05 address or a publishable tile identifier.
 */
export function buildLocalDraftIdentifier(
  pubkey: string,
  slug: string,
): string {
  const normalisedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 64);
  return `${shortPubkeyTag(pubkey)}@local:${normalisedSlug}`;
}

/**
 * Produce a publishable tile identifier when the user has a verified NIP-05.
 * Returns `null` if `nip05` is missing/malformed or `slug` is invalid.
 */
export function buildPublishableIdentifier(
  nip05: string | undefined,
  slug: string,
): string | null {
  if (!nip05 || !NIP05_RE.test(nip05)) return null;
  const normalisedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 64);
  if (!SLUG_RE.test(normalisedSlug)) return null;
  return `${nip05.toLowerCase()}:${normalisedSlug}`;
}

/**
 * Return true when the given metadata contains a NIP-05 address that looks
 * syntactically valid. The `metadata.nip05` field is user-supplied so we
 * guard even basic shape here; Ditto already verifies the HTTPS lookup
 * elsewhere when it matters for trust.
 */
export function canPublishTile(metadata: NostrMetadata | undefined | null): boolean {
  const nip05 = metadata?.nip05;
  return typeof nip05 === 'string' && NIP05_RE.test(nip05);
}

/**
 * Encode a kind-30207 tile event as a NIP-19 `naddr1…` identifier suitable
 * for storing in `AppConfig.installedTiles`.
 */
export function tileEventToNaddr(event: NostrEvent, relayHint?: string): string {
  const d = getDTag(event) ?? '';
  return nip19.naddrEncode({
    kind: event.kind,
    pubkey: event.pubkey,
    identifier: d,
    relays: relayHint ? [relayHint] : undefined,
  });
}

/**
 * Decode an `naddr1` pointer, returning its components or `null` when the
 * input is malformed or not an `naddr1` tile pointer.
 */
export function decodeTileNaddr(
  naddr: string,
): { kind: number; pubkey: string; identifier: string; relays?: string[] } | null {
  try {
    const decoded = nip19.decode(naddr);
    if (decoded.type !== 'naddr') return null;
    return decoded.data;
  } catch {
    return null;
  }
}
