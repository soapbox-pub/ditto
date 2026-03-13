/**
 * useResolveTabFilter
 *
 * Resolves variable placeholders in a tab filter by:
 * 1. Setting `$me` to the owner's pubkey
 * 2. Fetching events referenced by `var` tags
 * 3. Extracting tag values to populate variables
 * 4. Substituting all variables into the filter
 */
import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQueries } from '@tanstack/react-query';
import { resolvePointer, resolveFilter, type TabFilter, type TabVarDef } from '@/lib/profileTabsEvent';
import type { NostrFilter } from '@nostrify/nostrify';

interface ResolvedTabFilter {
  filter: NostrFilter | null;
  isLoading: boolean;
}

/**
 * Resolve a tab filter with variable substitution.
 *
 * @param tabFilter - The filter with potential `$variable` placeholders
 * @param vars - Variable definitions from the kind 16769 event
 * @param ownerPubkey - The profile owner's pubkey (used as `$me`)
 */
export function useResolveTabFilter(
  tabFilter: TabFilter,
  vars: TabVarDef[],
  ownerPubkey: string,
): ResolvedTabFilter {
  const { nostr } = useNostr();

  const runtimeVars = useMemo(() => ({ '$me': ownerPubkey }), [ownerPubkey]);

  // Build queries for each var definition
  const varQueries = useQueries({
    queries: vars.map((v) => {
      const pointer = resolvePointer(v.pointer, runtimeVars);

      const queryFilter: NostrFilter | null = pointer
        ? pointer.type === 'e'
          ? { ids: [pointer.id], limit: 1 }
          : { kinds: [pointer.kind], authors: [pointer.pubkey], '#d': [pointer.dTag], limit: 1 }
        : null;

      return {
        queryKey: ['tab-var', v.name, v.pointer, ownerPubkey],
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
          if (!queryFilter) return [];
          const events = await nostr.query(
            [queryFilter],
            { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
          );
          if (events.length === 0) return [];
          // Extract all values of the specified tag
          return events[0].tags
            .filter(([name]) => name === v.tagName)
            .map(([, value]) => value)
            .filter(Boolean) as string[];
        },
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        enabled: !!pointer,
      };
    }),
  });

  const isLoading = varQueries.some((q) => q.isLoading);

  const resolvedFilter = useMemo<NostrFilter | null>(() => {
    if (isLoading) return null;

    // Build resolved vars map
    const resolvedVars: Record<string, string[]> = {};
    vars.forEach((v, i) => {
      const data = varQueries[i]?.data;
      if (data) {
        resolvedVars[v.name] = data;
      }
    });

    return resolveFilter(tabFilter, resolvedVars, runtimeVars);
  }, [isLoading, vars, varQueries, tabFilter, runtimeVars]);

  return { filter: resolvedFilter, isLoading };
}
