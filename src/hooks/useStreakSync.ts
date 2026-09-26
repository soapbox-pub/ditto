import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { isSyncDone } from '@/hooks/useInitialSync';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useNostrStorage } from '@/hooks/useNostrStorage';
import { mergeStreakIntoCache, streakQueryKey } from '@/hooks/useStreak';
import { getEffectiveRelays } from '@/lib/appRelays';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { getStorageKey } from '@/lib/storageKey';
import {
  advanceStreak,
  buildStreakTags,
  isStreakLive,
  mergeStreaks,
  notifyStreakStarted,
  parseStreakEvent,
  sameStreak,
  STREAK_KIND,
  STREAK_WINDOW,
  subscribeStreakActivity,
  type Streak,
} from '@/lib/streak';
import { repairStreakBackward, repairStreakForward } from '@/lib/streakRepair';

/** Batch a posting session into one streak event (one signer prompt). */
const PUBLISH_DEBOUNCE_MS = 60_000;
/** Let the app settle before the first repair. */
const REPAIR_DELAY_MS = 8_000;
/** Minimum time between background repairs. */
const REPAIR_INTERVAL_MS = 30 * 60_000;

function whenIdle(callback: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(callback, { timeout: 10_000 });
  } else {
    setTimeout(callback, 0);
  }
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage may not be available
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Keep the logged-in user's posting streak (kind 13473) up to date.
 *
 * - Every creative event published through Ditto advances the streak
 *   immediately in the query cache, and a debounced publish records it.
 * - A background repair folds in events posted from other clients, which
 *   never touch the streak event. It walks forward only from the last
 *   recorded `end`, and backward from `start` only when that start hasn't
 *   been verified yet, so it's normally one or two tiny queries.
 */
export function useStreakSync(): void {
  const { nostr } = useNostr();
  const { store } = useNostrStorage();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  // Other clients publish to the user's write relays, so that's where to look.
  const relays = useMemo(() => {
    const { relays } = getEffectiveRelays(config.relayMetadata, config.useAppRelays, config.useUserRelays);
    const write = relays.filter((r) => r.write).map((r) => r.url);
    return write.length ? write : relays.map((r) => r.url);
  }, [config.relayMetadata, config.useAppRelays, config.useUserRelays]);

  // The effect below lives for the whole login; read changing values through a ref.
  const latest = useRef({ user, relays, publishEvent });
  latest.current = { user, relays, publishEvent };

  const pubkey = user?.pubkey;
  const appId = config.appId;

  useEffect(() => {
    if (!pubkey) return;

    const controller = new AbortController();
    const { signal } = controller;
    const filter = { kinds: [STREAK_KIND], authors: [pubkey] };
    const checkedKey = getStorageKey(appId, `streak-checked-start:${pubkey}`);

    /** Best known streak: recorded, repaired, and optimistic updates merged. */
    let current = queryClient.getQueryData<Streak | null>(streakQueryKey(pubkey)) ?? undefined;
    let publishTimer: ReturnType<typeof setTimeout> | undefined;
    let repairing: Promise<void> | undefined;
    let lastRepairAt = 0;
    let celebratedStart: number | undefined;

    const ctx = () => ({ nostr, store, relays: latest.current.relays, pubkey, signal });

    const update = (next: Streak | undefined) => {
      current = mergeStreakIntoCache(queryClient, pubkey, [current, next]);
    };

    const publish = async () => {
      publishTimer = undefined;
      const { user, publishEvent } = latest.current;
      if (signal.aborted || user?.pubkey !== pubkey) return;

      const fresh = await fetchFreshEvent(nostr, filter, { store, signal });
      const recorded = parseStreakEvent(fresh);
      const next = mergeStreaks(recorded, current);
      update(next);
      if (!next || sameStreak(next, recorded)) return;

      await publishEvent({ kind: STREAK_KIND, content: '', tags: buildStreakTags(next), prev: fresh ?? undefined });
    };

    const runPublish = () => {
      publish().catch((error) => {
        if (!isAbort(error)) console.warn('Streak publish failed:', error);
      });
    };

    const schedulePublish = () => {
      if (publishTimer) clearTimeout(publishTimer);
      publishTimer = setTimeout(runPublish, PUBLISH_DEBOUNCE_MS);
    };

    const flush = () => {
      if (!publishTimer) return;
      clearTimeout(publishTimer);
      runPublish();
    };

    const repair = (): Promise<void> => {
      repairing ??= (async () => {
        try {
          const fresh = await fetchFreshEvent(nostr, filter, { store, signal });
          const recorded = parseStreakEvent(fresh);
          update(recorded);

          let next = await repairStreakForward(ctx(), current);
          if (isStreakLive(next) && readStorage(checkedKey) !== String(next.start)) {
            next = await repairStreakBackward(ctx(), next);
            writeStorage(checkedKey, String(next.start));
          }
          update(next);
          lastRepairAt = Date.now();

          if (current && !sameStreak(mergeStreaks(recorded, current), recorded)) schedulePublish();
        } finally {
          repairing = undefined;
        }
      })();
      return repairing;
    };

    const runRepair = () => {
      if (signal.aborted || Date.now() - lastRepairAt < REPAIR_INTERVAL_MS) return;
      // Don't compete with the first-login sync; try again on the next visit.
      if (!isSyncDone(appId, pubkey)) return;
      repair().catch((error) => {
        if (!isAbort(error)) console.warn('Streak repair failed:', error);
      });
    };

    const onActivity = async (event: NostrEvent) => {
      if (event.pubkey !== pubkey) return;

      // This event would start a new streak. First make sure posts from other
      // clients didn't keep the old one alive.
      if (!current || event.created_at - current.end > STREAK_WINDOW) {
        try {
          await repair();
        } catch (error) {
          if (isAbort(error)) return;
          console.warn('Streak repair failed:', error);
        }
      }

      update(advanceStreak(current, event.created_at));
      schedulePublish();

      if (current && current.start === event.created_at && celebratedStart !== current.start) {
        celebratedStart = current.start;
        notifyStreakStarted(pubkey);
      }
    };

    const unsubscribe = subscribeStreakActivity((event) => {
      void onActivity(event);
    });

    const startTimer = setTimeout(() => whenIdle(runRepair), REPAIR_DELAY_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
      else runRepair();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flush);

    return () => {
      // A pending publish is dropped rather than flushed: on an account switch
      // the signer already belongs to someone else. The next repair recovers it.
      controller.abort();
      unsubscribe();
      clearTimeout(startTimer);
      if (publishTimer) clearTimeout(publishTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flush);
    };
  }, [pubkey, appId, nostr, store, queryClient]);
}
