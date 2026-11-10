import { useQueryClient, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import {
  consumeLaunchFeedSnapshot,
  getLaunchFeedSnapshot,
  saveFeedSnapshot,
  type FeedSnapshotRef,
} from '@/lib/feedSnapshot';

/** Wait for a burst of page loads to finish before serializing the feed. */
const SAVE_DELAY_MS = 1000;

/**
 * `initialData` options that start a feed query from its saved snapshot.
 *
 * A snapshot the launch is restoring a position in counts as fresh, so the
 * query doesn't refetch and shift the feed under the user; otherwise it is
 * as stale as its age and the query refetches straight away. Once the query
 * has fetched this session the snapshot is no longer offered, so a later
 * key change (mute list, Discover network) falls back to the fetched pages
 * via `placeholderData` instead of the older snapshot.
 */
export function feedSnapshotOptions<TPage, TParam>(ref: FeedSnapshotRef | undefined): {
  initialData?: InfiniteData<TPage, TParam>;
  initialDataUpdatedAt?: number;
} {
  const snapshot = getLaunchFeedSnapshot(ref);
  if (!snapshot || snapshot.consumed) return {};
  return {
    initialData: snapshot.data as InfiniteData<TPage, TParam>,
    initialDataUpdatedAt: snapshot.scroll ? snapshot.claimedAt : snapshot.savedAt,
  };
}

/** Keep `ref`'s snapshot up to date with what the feed query has fetched. */
export function usePersistFeedSnapshot(
  ref: FeedSnapshotRef | undefined,
  queryKey: QueryKey,
  query: { isFetched: boolean; isPlaceholderData: boolean; dataUpdatedAt: number },
): void {
  const queryClient = useQueryClient();
  const queryKeyRef = useRef(queryKey);
  queryKeyRef.current = queryKey;
  const refRef = useRef(ref);
  refRef.current = ref;

  const { isFetched, isPlaceholderData, dataUpdatedAt } = query;
  const appId = ref?.appId;
  const name = ref?.name;

  useEffect(() => {
    const current = refRef.current;
    if (!current || !isFetched || isPlaceholderData) return;
    consumeLaunchFeedSnapshot(current);
    const timer = setTimeout(() => {
      const data = queryClient.getQueryData<InfiniteData<unknown, unknown>>(queryKeyRef.current);
      if (data?.pages.length) saveFeedSnapshot(current, data, dataUpdatedAt);
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [queryClient, appId, name, isFetched, isPlaceholderData, dataUpdatedAt]);
}
