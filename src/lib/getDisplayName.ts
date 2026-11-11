import type { NostrMetadata } from '@nostrify/nostrify';

/** Matches a hex pubkey or bare npub, which some clients write into `name`. */
const KEY_LIKE = /^(?:[0-9a-f]{64}|npub1[02-9ac-hj-np-z]{58})$/i;

function usableName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || KEY_LIKE.test(trimmed)) return undefined;
  return value;
}

/**
 * The name to show for a profile, or `undefined` if it has none.
 * Prefers NIP-24 `display_name` over the shorter `name` handle, and skips
 * values that are just the account's key (e.g. `"name": "<64-char hex>"`).
 */
export function profileName(metadata: NostrMetadata | undefined): string | undefined {
  return usableName(metadata?.display_name) ?? usableName(metadata?.name);
}

/**
 * Get a display name for a user, falling back to "Anonymous".
 * Visual truncation is handled by CSS (`truncate` class) on the containing
 * element to avoid breaking NIP-30 custom emoji shortcodes.
 */
export function getDisplayName(
  metadata: NostrMetadata | undefined,
  _pubkey?: string,
): string {
  return profileName(metadata) ?? 'Anonymous';
}
