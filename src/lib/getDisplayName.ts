import { genUserName } from '@/lib/genUserName';
import type { NostrMetadata } from '@nostrify/nostrify';

/**
 * Get a display name for a user, with proper truncation for long names.
 * Uses metadata.name if available, otherwise generates a deterministic username.
 * Automatically truncates names longer than 30 characters.
 */
export function getDisplayName(
  metadata: NostrMetadata | undefined,
  pubkey: string,
  options?: { maxLength?: number }
): string {
  const maxLength = options?.maxLength ?? 30;
  const name = metadata?.name || genUserName(pubkey);
  
  // Truncate if longer than maxLength
  if (name.length > maxLength) {
    return name.slice(0, maxLength) + '…';
  }
  
  return name;
}
