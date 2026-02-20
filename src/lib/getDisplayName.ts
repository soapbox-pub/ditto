import { genUserName } from '@/lib/genUserName';
import type { NostrMetadata } from '@nostrify/nostrify';

/**
 * Get a display name for a user.
 * Uses metadata.name if available, otherwise generates a deterministic username.
 * Visual truncation is handled by CSS (`truncate` class) on the containing element
 * to avoid breaking NIP-30 custom emoji shortcodes.
 */
export function getDisplayName(
  metadata: NostrMetadata | undefined,
  pubkey: string,
): string {
  return metadata?.name || genUserName(pubkey);
}
