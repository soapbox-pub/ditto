import { lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';

const BlobbiCompanionLayer = lazy(() =>
  import('@/blobbi/companion').then((m) => ({ default: m.BlobbiCompanionLayer })),
);

/** Blobbi state events (kind 31124) — the authoritative "user owns a pet" signal. */
const KIND_BLOBBI_STATE = 31124;

/**
 * Mount gate for the Blobbi companion layer.
 *
 * The companion layer statically pulls the whole pet engine (~590K of art,
 * animation, and interaction code), so this gate keeps it entirely
 * un-downloaded until we know the user actually has a Blobbi:
 *
 * - Logged out → nothing loads.
 * - Logged in without a kind 31124 event → nothing loads.
 * - On /blobbi → always mount (covers hatching the very first egg, where the
 *   existence query would still be a stale "no").
 *
 * The query is author-filtered and cheap (limit 1), and the layer itself
 * remains responsible for all visibility logic once mounted.
 */
export function BlobbiCompanionGate() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { pathname } = useLocation();

  const onBlobbiPage = pathname === '/blobbi' || pathname.startsWith('/blobbi/');

  const { data: hasBlobbi } = useQuery({
    queryKey: ['blobbi', 'has-companion', user?.pubkey],
    enabled: !!user && !onBlobbiPage,
    // Re-check within a minute of route changes so a freshly hatched egg
    // (created on /blobbi) is picked up after navigating away.
    staleTime: 60_000,
    queryFn: async (c) => {
      const events = await nostr.query(
        [{ kinds: [KIND_BLOBBI_STATE], authors: [user!.pubkey], limit: 1 }],
        { signal: AbortSignal.any([c.signal, AbortSignal.timeout(5000)]) },
      );
      return events.length > 0;
    },
  });

  if (!user || !(onBlobbiPage || hasBlobbi)) return null;

  return (
    <Suspense fallback={null}>
      <BlobbiCompanionLayer />
    </Suspense>
  );
}
