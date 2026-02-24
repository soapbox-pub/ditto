import { nip19 } from 'nostr-tools';
import type { NostrMetadata } from '@nostrify/nostrify';

/**
 * Generates the profile URL for a user.
 *
 * Only uses the NIP-05 identifier as the URL path when `nip05Verified` is
 * explicitly `true` — i.e. the identifier has been confirmed to resolve to
 * this pubkey via /.well-known/nostr.json.
 *
 * Without verification the URL falls back to the npub so that an attacker
 * who claims someone else's NIP-05 in their kind-0 profile cannot hijack
 * profile links.
 *
 * `_@domain.com` users always fall back to npub because bare domains are
 * reserved for domain feeds, not individual profiles.
 */
export function getProfileUrl(
  pubkey: string,
  metadata?: NostrMetadata,
  nip05Verified = false,
): string {
  if (nip05Verified && metadata?.nip05) {
    const nip05 = metadata.nip05;
    // Only use NIP-05 URL for non-default users
    // _@domain.com falls through to npub (domain.com is the domain feed)
    if (!nip05.startsWith('_@')) {
      return `/${nip05}`;
    }
  }
  return `/${nip19.npubEncode(pubkey)}`;
}
