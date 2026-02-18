import type { NostrMetadata } from '@nostrify/nostrify';

/**
 * Checks if a user can be zapped based on their metadata.
 * A user can be zapped if they have either a lud16 or lud06 lightning address.
 */
export function canZap(metadata: NostrMetadata | undefined): boolean {
  if (!metadata) return false;
  return !!(metadata.lud16 || metadata.lud06);
}
