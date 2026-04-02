import { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import { AlertCircle, BookmarkPlus, Share2, WandSparkles } from 'lucide-react';

import { NoteCard } from '@/components/NoteCard';
import { PageHeader } from '@/components/PageHeader';
import { SpellContent } from '@/components/SpellContent';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSavedFeeds } from '@/hooks/useSavedFeeds';
import { useStreamPosts } from '@/hooks/useStreamPosts';
import { useToast } from '@/hooks/useToast';
import { shareOrCopy } from '@/lib/share';
import { cn } from '@/lib/utils';
import { resolveSpell } from '@/lib/spellEngine';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';
import NotFound from './NotFound';

import type { NostrEvent } from '@nostrify/nostrify';

export function SpellRunPage() {
  const params = useParams<{ nevent?: string; nip19?: string }>();
  const nevent = params.nevent ?? params.nip19;
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

  // Resolve the spell for error checking and cmd detection
  const resolved = useMemo(() => {
    if (!spellEvent) return null;
    try {
      return resolveSpell(spellEvent, user?.pubkey, contactPubkeys);
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to resolve spell' };
    }
  }, [spellEvent, user?.pubkey, contactPubkeys]);

  const resolveError = resolved && 'error' in resolved ? resolved.error : null;
  const cmd = resolved && !('error' in resolved) ? resolved.cmd : null;

  // Execute the spell via useStreamPosts (live streaming + initial batch)
  const { posts, isLoading: isLoadingResults, newPostCount, flushStreamBuffer } = useStreamPosts('', {
    includeReplies: true,
    mediaType: 'all',
    spell: spellEvent ?? undefined,
  });

  const spellName = spellEvent?.tags.find(([t]) => t === 'name')?.[1];

  // Home feed tab integration — toggle saving this spell as a home feed tab
  const { savedFeeds, addSavedFeed, removeSavedFeed } = useSavedFeeds();
  const { toast } = useToast();

  /** Find an existing saved feed that uses the same spell event (by event ID). */
  const matchingSavedFeed = useMemo(() => {
    if (!spellEvent) return undefined;
    return savedFeeds.find((f) => f.spell?.id === spellEvent.id);
  }, [savedFeeds, spellEvent]);

  const isSaved = !!matchingSavedFeed;

  const handleToggleSaved = useCallback(async () => {
    if (!spellEvent) return;
    if (isSaved && matchingSavedFeed) {
      await removeSavedFeed(matchingSavedFeed.id);
      toast({ title: 'Removed from home feed' });
    } else {
      await addSavedFeed(spellName ?? 'Spell', spellEvent);
      toast({ title: 'Added to home feed' });
    }
  }, [spellEvent, isSaved, matchingSavedFeed, spellName, addSavedFeed, removeSavedFeed, toast]);

  const handleShare = useCallback(async () => {
    if (!spellEvent || !nevent) return;
    const url = `${window.location.origin}/${nevent}`;
    const result = await shareOrCopy(url, spellName ?? 'Spell');
    if (result === 'copied') {
      toast({ title: 'Link copied to clipboard' });
    }
  }, [spellEvent, nevent, spellName, toast]);

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
        backTo="/search?tab=feeds"
      >
        {cmd && (
          <Badge variant="secondary" className="text-xs font-mono shrink-0">
            {cmd}
          </Badge>
        )}
      </PageHeader>

      {/* Spell summary card */}
      {spellEvent && (
        <div className="flex items-start gap-2 px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex-1 min-w-0">
            <SpellContent event={spellEvent} />
          </div>
          <button
            className="shrink-0 size-8 flex items-center justify-center group"
            onClick={handleShare}
            title="Share spell"
          >
            <Share2 className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
          </button>
          <button
            className="shrink-0 size-8 flex items-center justify-center group"
            onClick={handleToggleSaved}
            title={isSaved ? 'Remove from home feed' : 'Add to home feed'}
          >
            <BookmarkPlus className={cn(
              'size-4 transition-colors',
              isSaved
                ? 'fill-primary text-primary'
                : 'text-muted-foreground group-hover:text-primary',
            )} />
          </button>
        </div>
      )}

      {/* New posts pill */}
      {newPostCount > 0 && (
        <button
          onClick={flushStreamBuffer}
          className="w-full py-2 text-sm text-primary hover:bg-muted/50 border-b border-border transition-colors"
        >
          {newPostCount} new {newPostCount === 1 ? 'post' : 'posts'}
        </button>
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
      {(isLoadingSpell || (isLoadingResults && posts.length === 0)) && (
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
      {cmd === 'COUNT' && !isLoadingResults && (
        <div className="p-4">
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-4xl font-bold">{posts.length}</p>
              <p className="text-sm text-muted-foreground mt-1">events found</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* REQ results */}
      {cmd !== 'COUNT' && posts.length > 0 && (
        <div>
          {posts.map((event) => (
            <NoteCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoadingSpell && !isLoadingResults && posts.length === 0 && !resolveError && !spellError && spellEvent && (
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
