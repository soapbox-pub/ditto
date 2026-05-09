/**
 * Helpers for classifying Nostr event kinds by their storage semantics.
 *
 * Kind ranges (per NIP-01):
 *   - 0, 3                — legacy replaceable
 *   - 10000–19999         — replaceable
 *   - 20000–29999         — ephemeral
 *   - 30000–39999         — addressable (parameterized replaceable)
 *
 * For most "is this event replaceable" checks, prefer `isReplaceableLikeKind`,
 * which treats addressable and legacy-replaceable kinds as replaceable too.
 */

/** Returns true for parameterized replaceable (addressable) kinds 30000–39999. */
export function isAddressableKind(kind: number): boolean {
  return kind >= 30000 && kind < 40000;
}

/** Returns true for replaceable kinds 10000–19999 (excludes legacy 0 and 3). */
export function isReplaceableKind(kind: number): boolean {
  return kind >= 10000 && kind < 20000;
}

/** Returns true for ephemeral kinds 20000–29999. */
export function isEphemeralKind(kind: number): boolean {
  return kind >= 20000 && kind < 30000;
}

/**
 * Returns true if the kind has replaceable semantics — i.e. relays only keep
 * the latest version per author (and per `d` tag, for addressable kinds).
 *
 * Includes the legacy replaceable kinds 0 (profile metadata) and 3 (follow list)
 * along with the 10000–19999 and 30000–39999 ranges.
 */
export function isReplaceableLikeKind(kind: number): boolean {
  if (kind === 0 || kind === 3) return true;
  return isReplaceableKind(kind) || isAddressableKind(kind);
}
