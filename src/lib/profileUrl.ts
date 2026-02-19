import { nip19 } from 'nostr-tools';
import type { NostrMetadata } from '@nostrify/nostrify';

/**
 * Generates the profile URL for a user.
 * 
 * If the user has a verified NIP-05 identifier with a real username (not `_`):
 * - `user@domain.com` → `/user@domain.com`
 * 
 * `_@domain.com` users fall back to npub since bare domains are reserved
 * for domain feeds.
 * 
 * Otherwise falls back to npub:
 * - `/npub1abc...`
 */
export function getProfileUrl(pubkey: string, metadata?: NostrMetadata): string {
  if (metadata?.nip05) {
    const nip05 = metadata.nip05;
    // Only use NIP-05 URL for non-default users
    // _@domain.com falls through to npub (domain.com is the domain feed)
    if (!nip05.startsWith('_@')) {
      return `/${nip05}`;
    }
  }
  return `/${nip19.npubEncode(pubkey)}`;
}
