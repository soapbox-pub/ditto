import { useState, useCallback } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';
import { getStorageKey } from '@/lib/storageKey';

/**
 * Manages the active feed tab for a specific feed page, persisting
 * the selection in sessionStorage so it survives navigation within
 * the same browser session.
 *
 * Until a tab is picked, the default is Follows for logged-in users who
 * follow someone, and the Ditto tab otherwise (falling back to the last valid
 * tab, typically 'global', on pages without one).
 *
 * Each feed page should pass a unique `feedId` (e.g. 'home', 'vines', 'videos').
 *
 * @param feedId  Unique identifier for this feed page.
 * @param validTabs  Optional list of valid tab values for validation. If omitted, any stored value is accepted.
 * @param defaultTabOverride  Optional default tab to use when nothing is persisted (overrides the follows/ditto default).
 */
export function useFeedTab<T extends string = string>(
  feedId: string,
  validTabs?: readonly T[],
  defaultTabOverride?: T,
): [T, (tab: T) => void] {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { data: followData } = useFollowList();
  const key = getStorageKey(config.appId, `feed-tab:${feedId}`);

  const [chosenTab, setChosenTab] = useState<T | null>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored && (!validTabs || validTabs.includes(stored as T))) {
        return stored as T;
      }
    } catch { /* sessionStorage unavailable */ }
    return null;
  });

  const setTab = useCallback((tab: T) => {
    setChosenTab(tab);
    try { sessionStorage.setItem(key, tab); } catch { /* ignore */ }
  }, [key]);

  if (chosenTab) return [chosenTab, setTab];

  // Computed each render so it settles once the follow list loads.
  const followsNobody = !!user && followData?.pubkeys.length === 0;
  const defaultTab = (defaultTabOverride ?? (user && !followsNobody ? 'follows' : 'ditto')) as T;
  if (validTabs && !validTabs.includes(defaultTab)) {
    return [validTabs[validTabs.length - 1], setTab];
  }
  return [defaultTab, setTab];
}
