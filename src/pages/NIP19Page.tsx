import { nip19 } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import NotFound from './NotFound';
import { ProfilePage } from './ProfilePage';
import { PostDetailPage, AddrPostDetailPage } from './PostDetailPage';
import type { AddressPointer } from 'nostr-tools/nip19';

/**
 * Returns true if the identifier looks like a NIP-05 username (contains @).
 */
function isNip05Like(id: string): boolean {
  return id.includes('@');
}

/**
 * Universal route handler for `/:param`.
 *
 * Dispatches based on the shape of the identifier:
 * - NIP-19 (`npub1...`, `note1...`, `nevent1...`, `naddr1...`, `nprofile1...`)
 * - NIP-05 (`user@domain.com`) → profile
 */
export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();

  if (!identifier) {
    return <NotFound />;
  }

  // NIP-05 identifier (user@domain.com) → profile
  if (isNip05Like(identifier)) {
    return <ProfilePage />;
  }

  // Try NIP-19 decoding
  let decoded;
  try {
    decoded = nip19.decode(identifier);
  } catch {
    return <NotFound />;
  }

  const { type } = decoded;

  switch (type) {
    case 'npub':
    case 'nprofile':
      return <ProfilePage />;

    case 'note':
      return <PostDetailPage eventId={decoded.data as string} />;

    case 'nevent': {
      const neventData = decoded.data as { id: string; relays?: string[]; author?: string };
      return <PostDetailPage eventId={neventData.id} relays={neventData.relays} authorHint={neventData.author} />;
    }

    case 'naddr': {
      const addr = decoded.data as AddressPointer;
      return <AddrPostDetailPage addr={{ kind: addr.kind, pubkey: addr.pubkey, identifier: addr.identifier }} relays={addr.relays} />;
    }

    default:
      return <NotFound />;
  }
}
