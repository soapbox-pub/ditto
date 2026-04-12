import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useParams } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import { AlertCircle, BookmarkPlus, Check, Loader2, Share2, User, WandSparkles } from 'lucide-react';

import { NoteCard } from '@/components/NoteCard';
import { PageHeader } from '@/components/PageHeader';
import { SaveDestinationRow } from '@/components/SaveDestinationRow';
import { SpellContent } from '@/components/SpellContent';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';
import { useProfileTabs } from '@/hooks/useProfileTabs';
import { usePublishProfileTabs } from '@/hooks/usePublishProfileTabs';
import { useSavedFeeds } from '@/hooks/useSavedFeeds';
import { useStreamPosts } from '@/hooks/useStreamPosts';
import { useToast } from '@/hooks/useToast';
import { shareOrCopy } from '@/lib/share';
import { cn } from '@/lib/utils';
import { resolveSpell } from '@/lib/spellEngine';
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
  const { posts, isLoading: isLoadingResults, newPostCount, flushStreamBuffer, loadMore, hasMore, isLoadingMore } = useStreamPosts('', {
    includeReplies: true,
    mediaType: 'all',
    spell: spellEvent ?? undefined,
  });

  const { ref: scrollRef, inView } = useInView({ threshold: 0, rootMargin: '400px' });

  useEffect(() => {
    if (inView && hasMore && !isLoadingMore) {
      loadMore();
    }
  }, [inView, hasMore, isLoadingMore, loadMore]);

  const spellName = spellEvent?.tags.find(([t]) => t === 'name')?.[1];

  // ── Save popover state ───────────────────────────────────────────────
  const { savedFeeds, addSavedFeed, removeSavedFeed } = useSavedFeeds();
  const profileTabsQuery = useProfileTabs(user?.pubkey);
  const { publishProfileTabs, isPending: isPublishingTabs } = usePublishProfileTabs();
  const { toast } = useToast();
  const [savePopoverOpen, setSavePopoverOpen] = useState(false);
  const [saveFeedLabel, setSaveFeedLabel] = useState('');
  const [savedJustNow, setSavedJustNow] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  /** Convert a spell event to a TabFilter for saving. */
  const spellAsFilter = useMemo(() => {
    if (!spellEvent) return undefined;
    try {
      const resolved = resolveSpell(spellEvent, undefined, []);
      return resolved.filter;
    } catch {
      return undefined;
    }
  }, [spellEvent]);

  /** Find an existing saved feed that matches the spell's filter. */
  const matchingSavedFeed = useMemo(() => {
    if (!spellAsFilter) return undefined;
    const filterKey = JSON.stringify(spellAsFilter);
    return savedFeeds.find((f) => JSON.stringify(f.filter) === filterKey);
  }, [savedFeeds, spellAsFilter]);

  const alreadySaved = !!matchingSavedFeed;

  const handleSaveHomeFeed = useCallback(async () => {
    if (!spellAsFilter || !saveFeedLabel.trim()) return;
    await addSavedFeed(saveFeedLabel.trim(), spellAsFilter as Record<string, unknown>, []);
    setSavePopoverOpen(false);
    setSaveFeedLabel('');
    setSavedJustNow(true);
    setTimeout(() => setSavedJustNow(false), 2000);
    toast({ title: 'Added to home feed' });
  }, [spellAsFilter, saveFeedLabel, addSavedFeed, toast]);

  const handleSaveProfileTab = useCallback(async () => {
    if (!spellAsFilter || !saveFeedLabel.trim() || !user) return;
    const tabFilter = spellAsFilter as Record<string, unknown>;
    const existing = profileTabsQuery.data ?? { tabs: [], vars: [] };
    await publishProfileTabs({
      tabs: [...existing.tabs, { label: saveFeedLabel.trim(), filter: tabFilter }],
      vars: existing.vars,
    });
    setSavePopoverOpen(false);
    setSaveFeedLabel('');
    setSavedJustNow(true);
    setTimeout(() => setSavedJustNow(false), 2000);
    toast({ title: 'Added to profile tabs' });
  }, [spellAsFilter, saveFeedLabel, user, profileTabsQuery.data, publishProfileTabs, toast]);

  const handleShare = useCallback(async () => {
    if (!spellEvent || !nevent || !saveFeedLabel.trim()) return;
    setIsSharing(true);
    try {
      const url = `${window.location.origin}/${nevent}`;
      const result = await shareOrCopy(url, saveFeedLabel.trim());
      if (result === 'copied') {
        toast({ title: 'Link copied to clipboard' });
      }
      setSavePopoverOpen(false);
      setSaveFeedLabel('');
    } finally {
      setIsSharing(false);
    }
  }, [spellEvent, nevent, saveFeedLabel, toast]);

  const handleRemoveSaved = useCallback(async () => {
    if (!matchingSavedFeed) return;
    await removeSavedFeed(matchingSavedFeed.id);
    toast({ title: 'Removed from home feed' });
  }, [matchingSavedFeed, removeSavedFeed, toast]);

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
        backTo="/discover"
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
          {user && (
            <Popover open={savePopoverOpen} onOpenChange={(o) => {
              setSavePopoverOpen(o);
              if (o && !saveFeedLabel) {
                setSaveFeedLabel(spellName ?? '');
              }
            }}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    'shrink-0 size-8 flex items-center justify-center rounded-md transition-colors',
                    alreadySaved || savedJustNow
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-label="Save spell"
                >
                  {savedJustNow ? <Check className="size-4" /> : <BookmarkPlus className={cn(
                    'size-4',
                    alreadySaved && 'fill-primary text-primary',
                  )} />}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-3 space-y-3">
                <p className="font-semibold text-sm">Save as tab</p>

                {alreadySaved ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Already saved to home feed.</p>
                    <button
                      onClick={handleRemoveSaved}
                      className="text-xs text-destructive hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <>
                    <Input
                      placeholder="Tab name…"
                      value={saveFeedLabel}
                      onChange={(e) => setSaveFeedLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveHomeFeed(); }}
                      className="bg-secondary/50 border-border focus-visible:ring-1 text-base md:text-sm"
                      autoFocus
                    />
                    <div className="space-y-1">
                      <SaveDestinationRow
                        icon={<BookmarkPlus className="size-4 text-muted-foreground" />}
                        label="Home feed"
                        description="Tab on your home page"
                        onClick={handleSaveHomeFeed}
                        disabled={!saveFeedLabel.trim()}
                        loading={false}
                      />
                      <SaveDestinationRow
                        icon={<User className="size-4 text-muted-foreground" />}
                        label="Profile tab"
                        description="Tab on your profile"
                        onClick={handleSaveProfileTab}
                        disabled={!saveFeedLabel.trim() || isPublishingTabs}
                        loading={isPublishingTabs}
                      />
                      <SaveDestinationRow
                        icon={<Share2 className="size-4 text-muted-foreground" />}
                        label="Share"
                        description="Copy link to this spell"
                        onClick={handleShare}
                        disabled={!saveFeedLabel.trim() || isSharing}
                        loading={isSharing}
                      />
                    </div>
                  </>
                )}
              </PopoverContent>
            </Popover>
          )}
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
          {hasMore && (
            <div ref={scrollRef} className="py-4">
              {isLoadingMore && (
                <div className="flex justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}
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
