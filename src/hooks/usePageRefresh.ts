import { useCallback, useRef } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

/**
 * Returns an async `handleRefresh` callback that invalidates the given query keys.
 *
 * Designed to be passed directly to `<PullToRefresh onRefresh={handleRefresh}>`.
 *
 * @param queryKeys - One or more TanStack Query keys to invalidate on refresh.
 *   Accepts a single key or an array of keys. Each key is matched as a prefix,
 *   so `['feed']` invalidates `['feed', 'follows']`, `['feed', 'global']`, etc.
 */
export function usePageRefresh(queryKeys: QueryKey | QueryKey[]): () => Promise<void> {
  const queryClient = useQueryClient();

  // Keep the latest keys in a ref so the returned callback is referentially
  // stable and doesn't re-create on every render when callers pass inline arrays.
  const keysRef = useRef(queryKeys);
  keysRef.current = queryKeys;

  return useCallback(async () => {
    const qk = keysRef.current;
    // Normalise: if the first element is not an array, it's a single key
    const keys: QueryKey[] = Array.isArray(qk[0]) ? (qk as QueryKey[]) : [qk];
    await Promise.all(
      keys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
    );
  }, [queryClient]);
}
