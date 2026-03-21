import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Search, Check, Zap, Sparkles } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileBadges } from '@/hooks/useProfileBadges';
import { SHOP_CATEGORIES } from '@/lib/shopCategories';
import { parseBadgeDefinition, type BadgeData } from '@/components/BadgeContent';
import { BADGE_DEFINITION_KIND, getBadgePrice, getBadgeSupply, getBadgeCategory, isShopBadge } from '@/lib/badgeUtils';

export function ShopPage() {
  const { config } = useAppContext();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { refs: ownedBadgeRefs } = useProfileBadges(user?.pubkey);

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchText, setSearchText] = useState('');

  useSeoMeta({ title: 'Badge Shop' });

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

  // Set of owned badge aTags for O(1) lookup
  const ownedATags = useMemo(
    () => new Set(ownedBadgeRefs.map((r) => r.aTag)),
    [ownedBadgeRefs],
  );

  // Parse, filter by category and search
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
    <div className="container max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center size-10 rounded-xl bg-primary/10">
          <ShoppingBag className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Badge Shop</h1>
          <p className="text-sm text-muted-foreground">Collect badges to show off on your profile</p>
        </div>
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
                  {/* Badge image */}
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
                    {/* Name */}
                    <p className="font-semibold text-sm leading-snug truncate">{badge.name}</p>

                    {/* Description */}
                    {badge.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {badge.description}
                      </p>
                    )}

                    {/* Price / Owned + Supply */}
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
