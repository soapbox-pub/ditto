import { nip19 } from 'nostr-tools';
import { useParams, Navigate } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import NotFound from './NotFound';
import { ProfilePage } from './ProfilePage';
import { PostDetailPage, AddrPostDetailPage, PostDetailShell, PostDetailSkeleton } from './PostDetailPage';
import type { AddressPointer } from 'nostr-tools/nip19';

const HEX_64_RE = /^[0-9a-f]{64}$/;

/**
 * Returns true if the identifier looks like a NIP-05 identifier.
 * Covers both `user@domain.com` and bare domains like `fiatjaf.com`
 * (which represent `_@domain.com` root users).
 */
function isNip05Like(id: string): boolean {
  if (id.includes('@')) return true;
  // Bare domain (e.g. "fiatjaf.com") — has a dot but is not a NIP-19 bech32 prefix
  if (id.includes('.') && !id.startsWith('npub1') && !id.startsWith('nprofile1')) return true;
  return false;
}

/**
 * Resolves a raw 64-char hex string to either an event ID or a pubkey.
 * Tries to find an event with that ID first; if none is found, checks
 * whether a kind-0 profile exists for it as a pubkey.
 */
function HexIdentifierPage({ hex }: { hex: string }) {
  const { nostr } = useNostr();

  const { data: resolved, isLoading } = useQuery({
    queryKey: ['hex-resolve', hex],
    queryFn: async () => {
      // Try as event ID first
      const events = await nostr.query([{ ids: [hex], limit: 1 }]);
      if (events.length > 0) {
        return 'event' as const;
      }
      // Try as pubkey (look for kind 0 profile)
      const profiles = await nostr.query([{ kinds: [0], authors: [hex], limit: 1 }]);
      if (profiles.length > 0) {
        return 'pubkey' as const;
      }
      return 'event' as const; // default to event — PostDetailPage will handle "not found"
    },
    staleTime: Infinity,
  });

  if (isLoading || !resolved) {
    return (
      <PostDetailShell>
        <PostDetailSkeleton />
      </PostDetailShell>
    );
  }

  if (resolved === 'pubkey') {
    return <ProfilePage />;
  }

  return <PostDetailPage eventId={hex} />;
}

/**
 * Universal route handler for `/:param`.
 *
 * Dispatches based on the shape of the identifier:
 * - NIP-19 (`npub1...`, `note1...`, `nevent1...`, `naddr1...`, `nprofile1...`)
 * - NIP-05 (`user@domain.com`) → profile
 * - Raw 64-char hex → event ID or pubkey (resolved via relay query)
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

  // Raw 64-char hex — could be event ID or pubkey, need to resolve
  if (HEX_64_RE.test(identifier)) {
    return <HexIdentifierPage hex={identifier} />;
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
      if (addr.kind === 30207) {
        return <Navigate to={`/tiles/${encodeURIComponent(identifier)}`} replace />;
      }
      return <AddrPostDetailPage addr={{ kind: addr.kind, pubkey: addr.pubkey, identifier: addr.identifier }} relays={addr.relays} />;
    }

    default:
      return <NotFound />;
  }
}
