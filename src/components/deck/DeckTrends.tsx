import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteCard } from '@/components/NoteCard';
import { TrendSparkline } from '@/components/RightSidebar';
import { useTrendingTags, useSortedPosts, useTagSparklines } from '@/hooks/useTrending';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { useDeckNavigation } from '@/components/deck/DeckNavigationContext';

/** Trending tags + hot posts for a deck column. */
export function DeckTrends() {
  const { data: trendingTagsResult, isLoading: tagsLoading } = useTrendingTags(true);
  const { data: rawHotPosts, isLoading: hotLoading } = useSortedPosts('hot', 10, true);
  const { muteItems } = useMuteList();
  const deckNav = useDeckNavigation();

  const trendingTags = trendingTagsResult?.tags;
  const labelCreatedAt = trendingTagsResult?.labelCreatedAt ?? 0;

  const hotPosts = useMemo(() => {
    if (!rawHotPosts || muteItems.length === 0) return rawHotPosts;
    return rawHotPosts.filter((e) => !isEventMuted(e, muteItems));
  }, [rawHotPosts, muteItems]);

  const visibleTags = useMemo(() => (trendingTags ?? []).slice(0, 8).map((t) => t.tag), [trendingTags]);
  const { data: sparklineData, isLoading: sparklinesLoading } = useTagSparklines(visibleTags, labelCreatedAt, visibleTags.length > 0);

  return (
    <div>
      {/* Trending Tags */}
      <section className="p-4 border-b border-border">
        <h3 className="font-bold text-sm mb-3">Trending Tags</h3>
        {tagsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-12" />
              </div>
            ))}
          </div>
        ) : trendingTags && trendingTags.length > 0 ? (
          <div className="space-y-2">
            {trendingTags.slice(0, 8).map((item) => {
              const inner = (
                <>
                  <div>
                    <div className="font-bold text-sm">#{item.tag}</div>
                    {item.accounts > 0 && (
                      <div className="text-xs text-muted-foreground">
                        <span className="text-primary font-semibold">{item.accounts.toLocaleString()}</span> people
                      </div>
                    )}
                  </div>
                  {sparklinesLoading ? (
                    <Skeleton className="h-[28px] w-[50px] rounded" />
                  ) : (
                    <TrendSparkline data={sparklineData?.get(item.tag) ?? []} />
                  )}
                </>
              );

              // In deck mode, open a hashtag column instead of navigating
              if (deckNav) {
                return (
                  <button
                    key={item.tag}
                    onClick={() => deckNav.openHashtag(item.tag)}
                    className="flex items-center justify-between hover:bg-secondary/40 -mx-2 px-2 py-1.5 rounded-lg transition-colors w-full text-left"
                  >
                    {inner}
                  </button>
                );
              }

              return (
                <Link
                  key={item.tag}
                  to={`/t/${item.tag}`}
                  className="flex items-center justify-between hover:bg-secondary/40 -mx-2 px-2 py-1.5 rounded-lg transition-colors"
                >
                  {inner}
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No trends available.</p>
        )}
      </section>

      {/* Hot Posts */}
      <section className="p-4">
        <h3 className="font-bold text-sm mb-3">Hot Posts</h3>
        {hotLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : hotPosts && hotPosts.length > 0 ? (
          <div>
            {hotPosts.map((event) => (
              <NoteCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No hot posts right now.</p>
        )}
      </section>
    </div>
  );
}
