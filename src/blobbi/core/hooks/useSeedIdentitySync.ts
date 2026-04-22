/**
 * Seed Identity Sync Hook
 *
 * Automatically republishes visible Blobbi companions whose persisted
 * mirror tags (colors, pattern, size, adult_type) don't match the
 * seed-derived canonical values.
 *
 * Runs once per companion list change, only republishes on actual mismatch.
 */

import { useEffect, useRef } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostrPublish } from '@/hooks/useNostrPublish';

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
          // Include the (possibly adjusted) seed in updates so that
          // syncMirrorTagsToSeed reads the correct seed value.
          const newTags = updateBlobbiTags(c.allTags, { seed: c.seed! });
          const event = await publishEvent({
            kind: KIND_BLOBBI_STATE,
            content: c.event.content,
            tags: newTags,
            prev: c.event,
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
  }, [companions, publishEvent, updateCompanionEvent]);
}
