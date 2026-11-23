import { useCallback, useSyncExternalStore } from 'react';

import { useAppContext } from './useAppContext';
import type { DiscoverSort } from '@/lib/discoverNetwork';
import { getStorageKey } from '@/lib/storageKey';

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readSort(key: string): DiscoverSort {
  try {
    const stored = localStorage.getItem(key);
    return stored === 'rising' || stored === 'latest' ? stored : 'hot';
  } catch {
    return 'hot';
  }
}

/**
 * The user's sort for Discover tabs that can be ranked (homepage Discover,
 * `hotGlobal` kind pages), saved on the device. Shared live between every
 * component that reads it, so a sort picked in a page header reaches the feed.
 */
export function useDiscoverSort(): [DiscoverSort, (sort: DiscoverSort) => void] {
  const { config } = useAppContext();
  const key = getStorageKey(config.appId, 'discoverSort');

  const sort = useSyncExternalStore(subscribe, () => readSort(key));

  const setSort = useCallback((next: DiscoverSort) => {
    try {
      localStorage.setItem(key, next);
    } catch {
      // Quota exceeded; the sort just won't persist.
    }
    for (const listener of listeners) listener();
  }, [key]);

  return [sort, setSort];
}
