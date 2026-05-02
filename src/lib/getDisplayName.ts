import { genUserName } from '@/lib/genUserName';
import type { NostrMetadata } from '@nostrify/nostrify';

/**
 * Get a display name for a user.
 * Prefers metadata.name, falls back to metadata.display_name, then a
 * deterministic generated username. Visual truncation is handled by CSS
 * (`truncate` class) on the containing element to avoid breaking NIP-30
 * custom emoji shortcodes.
 */
export function getDisplayName(
  metadata: NostrMetadata | undefined,
  pubkey: string,
): string {
  return metadata?.name || metadata?.display_name || genUserName(pubkey);
}
