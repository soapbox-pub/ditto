import { useState, useCallback } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const STORAGE_PREFIX = 'ditto:feed-tab:';

/**
 * Manages the active feed tab for a specific feed page, persisting
 * the selection in sessionStorage so it survives navigation within
 * the same browser session.
 *
 * Each feed page should pass a unique `feedId` (e.g. 'home', 'vines', 'videos').
 *
 * @param feedId  Unique identifier for this feed page.
 * @param validTabs  Optional list of valid tab values for validation. If omitted, any stored value is accepted.
 */
export function useFeedTab<T extends string = string>(
  feedId: string,
  validTabs?: readonly T[],
): [T, (tab: T) => void] {
  const { user } = useCurrentUser();
  const key = STORAGE_PREFIX + feedId;

  const [activeTab, setActiveTab] = useState<T>(() => {
    const defaultTab = (user ? 'follows' : 'global') as T;
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) {
        if (!validTabs || validTabs.includes(stored as T)) {
          return stored as T;
        }
      }
    } catch { /* sessionStorage unavailable */ }
    return defaultTab;
  });

  const setTab = useCallback((tab: T) => {
    setActiveTab(tab);
    try { sessionStorage.setItem(key, tab); } catch { /* ignore */ }
  }, [key]);

  return [activeTab, setTab];
}
