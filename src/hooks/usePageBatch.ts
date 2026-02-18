/**
 * usePageBatch — per-page author & stats prefetching for the feed.
 *
 * WHY THIS EXISTS
 * ---------------
 * The naive approach is to gather all pubkeys / event IDs across every loaded
 * page into a single array and pass that to useAuthors / useBatchEventStats.
 * That creates a query key like:
 *
 *   ['authors', 'aaa,bbb,ccc,ddd,eee,...']
 *
 * When page 2 loads the key changes to:
 *
 *   ['authors', 'aaa,bbb,ccc,ddd,eee,...,fff,ggg,...']
 *
 * React Query treats this as a completely new query, abandons the old cache
 * entry, and fires a fresh request for ALL pubkeys.  On page 3 the same thing
 * happens again.  This means:
 *   • Each new page causes a full re-fetch of every previous page's data.
 *   • The ever-growing request may time out or return a truncated result set.
 *   • Stats / author data appear to "drop" for already-rendered cards.
 *
 * THE FIX
 * -------
 * Call the batch hooks once per page instead of once for the whole feed.
 * Each page's cache key is stable after it is first fetched, so loading
 * page 2 does NOT invalidate page 1's data.
 *
 * We render one invisible <PageBatchFetcher> per page.  React's rules of
 * hooks don't allow dynamic numbers of hook calls, so the per-page work is
 * delegated to a dedicated component that calls the hooks unconditionally.
 */

import { useAuthors } from '@/hooks/useAuthors';
import { useBatchEventStats } from '@/hooks/useTrending';
import { useMemo } from 'react';
import type { FeedItem } from '@/hooks/useFeed';

/**
 * Prefetches authors and event stats for a single feed page.
 * Designed to be called once per page so the query key stays stable
 * even as more pages are loaded.
 */
export function usePageBatchEntry(page: FeedItem[]) {
  // Build a stable string fingerprint of the page's event IDs.
  // This is used as the sole dependency for derived arrays so that
  // re-renders with the same page content (same array reference or not)
  // don't trigger new queries.
  const pageFingerprint = page.length === 0
    ? ''
    : page.map((i) => i.event.id).join(',');

  const pubkeys = useMemo(() => {
    if (pageFingerprint === '') return [] as string[];
    const keys = new Set<string>();
    for (const item of page) {
      keys.add(item.event.pubkey);
      if (item.repostedBy) keys.add(item.repostedBy);
    }
    return [...keys].sort();
  // pageFingerprint is the stable proxy for the page's contents
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageFingerprint]);

  const eventIds = useMemo(
    () => (pageFingerprint === '' ? [] as string[] : page.map((item) => item.event.id)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [pageFingerprint],
  );

  useAuthors(pubkeys);
  useBatchEventStats(eventIds);
}

/**
 * Calls usePageBatchEntry for every page already loaded.
 *
 * Because we can't call a variable number of hooks, each page index gets its
 * own dedicated hook slot.  We support up to MAX_PAGES pages; pages beyond
 * that still render correctly — their authors/stats fall back to individual
 * useAuthor / useEventStats queries in NoteCard (same as before this hook
 * existed).
 *
 * In practice feeds rarely exceed ~10 pages before the user stops scrolling,
 * so MAX_PAGES = 20 is a comfortable upper bound.
 */
const MAX_PAGES = 20;
const EMPTY_PAGE: FeedItem[] = [];

export function usePageBatch(pages: FeedItem[][]) {
  // Pad to MAX_PAGES so hook call count is always the same
  const slots = useMemo(() => {
    const arr: FeedItem[][] = [];
    for (let i = 0; i < MAX_PAGES; i++) {
      arr.push(pages[i] ?? EMPTY_PAGE);
    }
    return arr;
  }, [pages]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[0]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[1]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[2]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[3]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[4]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[5]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[6]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[7]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[8]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[9]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[10]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[11]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[12]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[13]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[14]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[15]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[16]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[17]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[18]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePageBatchEntry(slots[19]);
}
