import { useMemo, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, Search, Check, Zap, Sparkles, Loader2, ArrowLeft, Plus, Settings2 } from 'lucide-react';
import { useSeoMeta } from '@unhead/react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteCard } from '@/components/NoteCard';
import { PullToRefresh } from '@/components/PullToRefresh';
import { FeedEmptyState } from '@/components/FeedEmptyState';
import { TabButton } from '@/components/TabButton';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileBadges } from '@/hooks/useProfileBadges';
import { useBadgeFeed } from '@/hooks/useBadgeFeed';
import { SHOP_CATEGORIES } from '@/lib/shopCategories';
import { parseBadgeDefinition, type BadgeData } from '@/components/BadgeContent';
import { BADGE_DEFINITION_KIND, getBadgePrice, getBadgeSupply, getBadgeCategory, isShopBadge } from '@/lib/badgeUtils';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ShopTab = 'shop' | 'follows' | 'global';

// ─── Shop Tab Content ──────────────────────────────────────────────────────────

function ShopContent() {
  const { config } = useAppContext();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { refs: ownedBadgeRefs } = useProfileBadges(user?.pubkey);

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchText, setSearchText] = useState('');

  const adminPubkey = config.nip85StatsPubkey;

  const { data: rawBadges, isLoading } = useQuery({
    queryKey: ['shop-badges', adminPubkey],
    queryFn: async ({ signal }) => {
      if (!adminPubkey) return [];
      const events = await nostr.query(
        [{ kinds: [BADGE_DEFINITION_KIND], authors: [adminPubkey], '#t': ['shop'], limit: 200 }],
        { signal },
      );
      return events.filter(isShopBadge);
    },
    enabled: !!adminPubkey,
    staleTime: 2 * 60_000,
  });

  const ownedATags = useMemo(
    () => new Set(ownedBadgeRefs.map((r) => r.aTag)),
    [ownedBadgeRefs],
  );

  const filteredBadges = useMemo(() => {
    if (!rawBadges) return [];

    const search = searchText.toLowerCase().trim();

    return rawBadges
      .map((event) => ({ event, badge: parseBadgeDefinition(event) }))
      .filter((item): item is { event: NostrEvent; badge: BadgeData } => item.badge !== null)
      .filter(({ event }) => {
        if (selectedCategory !== 'all') {
          const cat = getBadgeCategory(event);
          if (cat !== selectedCategory) return false;
        }
        return true;
      })
      .filter(({ badge }) => {
        if (!search) return true;
        const name = badge.name.toLowerCase();
        const desc = (badge.description ?? '').toLowerCase();
        return name.includes(search) || desc.includes(search);
      });
  }, [rawBadges, selectedCategory, searchText]);

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Quick actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <Link to="/badges/create">
            <Plus className="size-3.5" />
            Create Badge
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <Link to="/badges/manage">
            <Settings2 className="size-3.5" />
            My Badges
          </Link>
        </Button>
      </div>

      {/* Category filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4">
        {SHOP_CATEGORIES.map((cat) => (
          <Button
            key={cat.id}
            variant={selectedCategory === cat.id ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'shrink-0 rounded-full transition-all',
              selectedCategory === cat.id && 'shadow-sm',
            )}
            onClick={() => setSelectedCategory(cat.id)}
          >
            {cat.label}
          </Button>
        ))}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search badges..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Results count */}
      {!isLoading && (
        <p className="text-sm text-muted-foreground">
          Showing {filteredBadges.length} badge{filteredBadges.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Badge grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-square w-full rounded-none" />
              <CardContent className="p-3 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredBadges.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 px-8 text-center">
            <div className="max-w-sm mx-auto space-y-3">
              <Sparkles className="size-8 text-muted-foreground/50 mx-auto" />
              <p className="text-muted-foreground">
                No badges found. Try a different category or search term.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredBadges.map(({ event, badge }) => {
            const aTag = `${BADGE_DEFINITION_KIND}:${event.pubkey}:${badge.identifier}`;
            const owned = ownedATags.has(aTag);
            const price = getBadgePrice(event);
            const supply = getBadgeSupply(event);
            const heroImage = badge.image
              ?? badge.thumbs.find((t) => t.dimensions === '512x512')?.url
              ?? badge.thumbs[0]?.url;

            const naddr = nip19.naddrEncode({
              kind: BADGE_DEFINITION_KIND,
              pubkey: event.pubkey,
              identifier: badge.identifier,
            });

            return (
              <Link key={aTag} to={`/${naddr}`} className="group">
                <Card className="overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
                  <div className="aspect-square overflow-hidden bg-secondary/20">
                    {heroImage ? (
                      <img
                        src={heroImage}
                        alt={badge.name}
                        className="w-full h-full object-cover rounded-t-2xl transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-t-2xl">
                        <ShoppingBag className="size-12 text-primary/20" />
                      </div>
                    )}
                  </div>

                  <CardContent className="p-3 space-y-1.5">
                    <p className="font-semibold text-sm leading-snug truncate">{badge.name}</p>

                    {badge.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {badge.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      {owned ? (
                        <Badge variant="secondary" className="gap-1 text-xs font-medium">
                          <Check className="size-3" />
                          Owned
                        </Badge>
                      ) : price !== null ? (
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-500">
                          <Zap className="size-3.5 fill-amber-500" />
                          {price.toLocaleString()} sats
                        </span>
                      ) : null}

                      {supply && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {supply.sold !== undefined
                            ? `${Math.max(0, supply.total - supply.sold)} / ${supply.total}`
                            : `/ ${supply.total}`}
                          {' '}left
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── NoteCard Skeleton ─────────────────────────────────────────────────────────

function NoteCardSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border">
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
      <div className="flex items-center gap-6 mt-3 -ml-2">
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function ShopPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<ShopTab>(() => {
    try {
      const stored = sessionStorage.getItem('ditto:feed-tab:shop');
      if (stored === 'shop' || stored === 'follows' || stored === 'global') return stored;
    } catch { /* ignore */ }
    return 'shop';
  });

  const handleSetTab = useCallback((tab: ShopTab) => {
    setActiveTab(tab);
    try { sessionStorage.setItem('ditto:feed-tab:shop', tab); } catch { /* ignore */ }
  }, []);

  useSeoMeta({
    title: `Badge Shop | ${config.appName}`,
    description: 'Collect badges, discover new ones, and show them off on your profile',
  });

  // Feed query for follows/global tabs
  const feedTab = activeTab === 'follows' ? 'follows' : 'global';
  const feedQuery = useBadgeFeed(feedTab);

  const {
    data: rawData,
    isPending,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = feedQuery;

  // Auto-fetch page 2 for smoother scrolling
  useEffect(() => {
    if (activeTab !== 'shop' && hasNextPage && !isFetchingNextPage && rawData?.pages?.length === 1) {
      fetchNextPage();
    }
  }, [activeTab, hasNextPage, isFetchingNextPage, rawData?.pages?.length, fetchNextPage]);

  // Intersection observer for infinite scroll
  const { ref: scrollRef, inView } = useInView({
    threshold: 0,
    rootMargin: '400px',
  });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Flatten and deduplicate feed events
  const feedEvents = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();
    return (rawData.pages as NostrEvent[][])
      .flat()
      .filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      });
  }, [rawData?.pages]);

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['badge-feed', feedTab] });
  }, [queryClient, feedTab]);

  const showSkeleton = activeTab !== 'shop' && (isPending || (isLoading && !rawData));

  return (
    <main className="pb-16 sidebar:pb-0">
      {/* Page header */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-5">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <ShoppingBag className="size-5" />
          <h1 className="text-xl font-bold">Badge Shop</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10">
        <TabButton label="Shop" active={activeTab === 'shop'} onClick={() => handleSetTab('shop')} />
        <TabButton label="Follows" active={activeTab === 'follows'} onClick={() => handleSetTab('follows')} disabled={!user} />
        <TabButton label="Global" active={activeTab === 'global'} onClick={() => handleSetTab('global')} />
      </div>

      {/* Tab content */}
      {activeTab === 'shop' ? (
        <ShopContent />
      ) : (
        <PullToRefresh onRefresh={handleRefresh}>
          {showSkeleton ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <NoteCardSkeleton key={i} />
              ))}
            </div>
          ) : feedEvents.length > 0 ? (
            <div>
              {feedEvents.map((event) => (
                <NoteCard key={event.id} event={event} />
              ))}
              {hasNextPage && (
                <div ref={scrollRef} className="py-4">
                  {isFetchingNextPage && (
                    <div className="flex justify-center">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <FeedEmptyState
              message={
                activeTab === 'follows'
                  ? 'No badge activity from people you follow yet.'
                  : 'No badge activity found. Be the first to create one!'
              }
              onSwitchToGlobal={activeTab === 'follows' ? () => handleSetTab('global') : undefined}
            />
          )}
        </PullToRefresh>
      )}
    </main>
  );
}
