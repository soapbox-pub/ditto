import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import { AlertCircle, WandSparkles } from 'lucide-react';

import { NoteCard } from '@/components/NoteCard';
import { PageHeader } from '@/components/PageHeader';
import { SpellContent } from '@/components/SpellContent';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';
import { resolveSpell } from '@/lib/spellEngine';
import NotFound from './NotFound';

import type { NostrEvent } from '@nostrify/nostrify';

export function SpellRunPage() {
  const { nevent } = useParams<{ nevent: string }>();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const contactPubkeys = useMemo(() => followData?.pubkeys ?? [], [followData?.pubkeys]);

  // Decode the nevent identifier
  const decoded = useMemo(() => {
    if (!nevent) return null;
    try {
      const result = nip19.decode(nevent);
      if (result.type === 'nevent') return result.data;
      if (result.type === 'note') return { id: result.data, author: undefined, relays: undefined };
      return null;
    } catch {
      return null;
    }
  }, [nevent]);

  // Fetch the spell event
  const { data: spellEvent, isLoading: isLoadingSpell, error: spellError } = useQuery<NostrEvent | null>({
    queryKey: ['spell-event', decoded?.id],
    queryFn: async ({ signal }) => {
      if (!decoded) return null;
      const events = await nostr.query(
        [{ ids: [decoded.id], kinds: [777], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );
      return events[0] ?? null;
    },
    enabled: !!decoded,
    staleTime: 5 * 60 * 1000,
  });

  // Resolve the spell into a filter
  const resolved = useMemo(() => {
    if (!spellEvent) return null;
    try {
      return resolveSpell(spellEvent, user?.pubkey, contactPubkeys);
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to resolve spell' };
    }
  }, [spellEvent, user?.pubkey, contactPubkeys]);

  const resolvedFilter = resolved && !('error' in resolved) ? resolved : null;
  const resolveError = resolved && 'error' in resolved ? resolved.error : null;

  // Execute the spell query
  const { data: results, isLoading: isLoadingResults } = useQuery<NostrEvent[]>({
    queryKey: ['spell-results', decoded?.id, JSON.stringify(resolvedFilter?.filter)],
    queryFn: async ({ signal }) => {
      if (!resolvedFilter) return [];

      const store = resolvedFilter.relays.length > 0
        ? nostr.group(resolvedFilter.relays)
        : nostr;

      return store.query(
        [resolvedFilter.filter],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) },
      );
    },
    enabled: !!resolvedFilter,
    staleTime: 60 * 1000,
  });

  const spellName = spellEvent?.tags.find(([t]) => t === 'name')?.[1];

  useSeoMeta({
    title: spellName ? `${spellName} | Spell Results` : 'Spell Results',
  });

  // Invalid identifier
  if (!decoded) return <NotFound />;

  return (
    <main className="">
      <PageHeader
        title={spellName ?? 'Spell Results'}
        icon={<WandSparkles className="size-5 text-primary" />}
        backTo="/spells"
      >
        {resolvedFilter && (
          <Badge variant="secondary" className="text-xs font-mono shrink-0">
            {resolvedFilter.cmd}
          </Badge>
        )}
      </PageHeader>

      {/* Spell summary card */}
      {spellEvent && (
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <SpellContent event={spellEvent} />
        </div>
      )}

      {/* Error states */}
      {resolveError && (
        <div className="p-4">
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{resolveError}</AlertDescription>
          </Alert>
        </div>
      )}

      {spellError && (
        <div className="p-4">
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>Failed to fetch spell event.</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Loading states */}
      {(isLoadingSpell || (isLoadingResults && !results)) && (
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-11 rounded-full shrink-0" />
                <div className="min-w-0 space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
              <div className="mt-2 space-y-1.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* COUNT results */}
      {resolvedFilter?.cmd === 'COUNT' && results && (
        <div className="p-4">
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-4xl font-bold">{results.length}</p>
              <p className="text-sm text-muted-foreground mt-1">events found</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* REQ results */}
      {resolvedFilter?.cmd === 'REQ' && results && results.length > 0 && (
        <div>
          {results.map((event) => (
            <NoteCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {resolvedFilter && results && results.length === 0 && !isLoadingResults && (
        <div className="p-8 text-center">
          <Card className="border-dashed">
            <CardContent className="py-12 px-8">
              <p className="text-muted-foreground">
                No results found for this spell. The queried relays may not have matching events.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
