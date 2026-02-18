import { nip19 } from 'nostr-tools';
import { useParams, Navigate } from 'react-router-dom';
import NotFound from './NotFound';
import { PostDetailPage } from './PostDetailPage';
import { AddrDetailPage } from './AddrDetailPage';
import { FollowPackDetailPage } from '@/components/FollowPackDetail';
import type { AddressPointer } from 'nostr-tools/nip19';

/** Follow set and starter pack kinds (NIP-51). */
const FOLLOW_PACK_KINDS = new Set([30000, 39089]);

export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();

  if (!identifier) {
    return <NotFound />;
  }

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
      // Redirect to profile page
      return <Navigate to={`/u/${identifier}`} replace />;

    case 'note':
      return <PostDetailPage eventId={decoded.data as string} />;

    case 'nevent':
      return <PostDetailPage eventId={(decoded.data as { id: string }).id} />;

    case 'naddr': {
      const addr = decoded.data as AddressPointer;
      const coords = { kind: addr.kind, pubkey: addr.pubkey, identifier: addr.identifier };

      // Route follow packs / starter packs to the dedicated view
      if (FOLLOW_PACK_KINDS.has(addr.kind)) {
        return <FollowPackDetailPage addr={coords} />;
      }

      return <AddrDetailPage addr={coords} />;
    }

    default:
      return <NotFound />;
  }
}
