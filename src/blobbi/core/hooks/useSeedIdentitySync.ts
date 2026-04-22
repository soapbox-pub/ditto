/**
 * Seed Identity Sync Hook
 *
 * Automatically republishes visible Blobbi companions whose persisted
 * mirror tags (colors, pattern, size, adult_type) don't match the
 * seed-derived canonical values.
 *
 * Runs once per companion list change, only republishes on actual mismatch.
 * Uses fetchFreshEvent before each publish to avoid stale-read overwrites
 * (matches the project convention for replaceable event mutations).
 */

import { useEffect, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostrPublish } from '@/hooks/useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';

import {
  KIND_BLOBBI_STATE,
  updateBlobbiTags,
  type BlobbiCompanion,
} from '../lib/blobbi';

/**
 * For each visible companion that has needsSeedIdentitySync === true,
 * republish it with an `updateBlobbiTags` call that includes the
 * companion's (possibly adjusted) seed. The merge pipeline's
 * syncMirrorTagsToSeed will overwrite all stale mirror tags.
 *
 * Skips companions that are legacy (handled by migration) or have
 * no seed (nothing to sync to).
 */
export function useSeedIdentitySync(
  companions: BlobbiCompanion[],
  updateCompanionEvent: (event: NostrEvent) => void,
): void {
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent } = useNostrPublish();

  // Track which d-tags we've already synced in this session to avoid loops.
  const syncedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (companions.length === 0) return;

    const toSync = companions.filter(
      (c) => c.needsSeedIdentitySync && !c.isLegacy && c.seed && !syncedRef.current.has(c.d),
    );

    if (toSync.length === 0) return;

    // Mark as synced immediately to prevent re-entry on re-render
    for (const c of toSync) {
      syncedRef.current.add(c.d);
    }

    // Process sequentially to avoid relay rate-limiting
    (async () => {
      for (const c of toSync) {
        try {
          // Fetch the freshest version from relays to avoid stale overwrites
          // (another device may have updated the event since our cache was populated).
          const prev = await fetchFreshEvent(nostr, {
            kinds: [KIND_BLOBBI_STATE],
            authors: [c.event.pubkey],
            '#d': [c.d],
          });

          if (!prev) {
            if (import.meta.env.DEV) {
              console.warn('[SeedSync] No fresh event found for', c.d.slice(0, 20) + '...');
            }
            continue;
          }

          // Include the (possibly adjusted) seed in updates so that
          // syncMirrorTagsToSeed reads the correct seed value.
          const newTags = updateBlobbiTags(prev.tags, { seed: c.seed! });
          const event = await publishEvent({
            kind: KIND_BLOBBI_STATE,
            content: prev.content,
            tags: newTags,
            prev,
          });
          updateCompanionEvent(event);
          if (import.meta.env.DEV) {
            console.log('[SeedSync] Synced mirror tags for', c.d.slice(0, 20) + '...');
          }
        } catch (err) {
          console.warn('[SeedSync] Failed to sync', c.d.slice(0, 20) + '...', err);
          // Remove from synced set so it can be retried next render
          syncedRef.current.delete(c.d);
        }
      }
    })();
  }, [companions, nostr, publishEvent, updateCompanionEvent]);
}
