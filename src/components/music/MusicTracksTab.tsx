import { useState, useMemo, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import type { NostrEvent } from '@nostrify/nostrify';
import { useMusicFeed } from '@/hooks/useMusicFeed';
import { useMusicData } from '@/hooks/useMusicData';
import { useMuteList } from '@/hooks/useMuteList';
import { parseMusicTrack } from '@/lib/musicHelpers';
import { isEventMuted } from '@/lib/muteHelpers';
import { TagChips } from '@/components/discovery/TagChips';
import { MusicSortFilterBar, type MusicSort, type MusicScope } from './MusicSortFilterBar';
import { MusicTrackRow, MusicTrackRowSkeleton } from './MusicTrackRow';

/**
 * The "Tracks" tab — infinite scroll list of music tracks.
 *
 * Features:
 * - **Sort**: Hot (engagement + decay), Top (total engagement), New (chronological)
 * - **Scope**: Global (all artists) or Following (user's follow list)
 * - **Genre filter**: Client-side genre filtering via TagChips
 */
export function MusicTracksTab() {
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [sort, setSort] = useState<MusicSort>('new');
  const [scope, setScope] = useState<MusicScope>('global');
  const { muteItems } = useMuteList();

  // Base query for genre names only (reuses cached data from Discover tab)
  const { genres } = useMusicData();
  const genreNames = useMemo(() => genres.slice(0, 12).map((g) => g.genre), [genres]);

  // Infinite-scroll feed with sort + scope
  const feedQuery = useMusicFeed({ kind: 36787, sort, scope });
  const {
    data: rawData,
    isPending,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = feedQuery;

  // Auto-fetch page 2
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && rawData?.pages?.length === 1) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, rawData?.pages?.length, fetchNextPage]);

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

  // Flatten, deduplicate, filter
  const trackEvents = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();

    return rawData.pages
      .flat()
      .filter((event: NostrEvent) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        if (event.kind !== 36787) return false;
        if (parseMusicTrack(event) === null) return false;
        if (muteItems.length > 0 && isEventMuted(event, muteItems)) return false;
        // Genre filter: check t tags
        if (selectedGenre) {
          const hasGenre = event.tags.some(
            ([n, v]) => n === 't' && v?.toLowerCase() === selectedGenre,
          );
          if (!hasGenre) return false;
        }
        return true;
      });
  }, [rawData?.pages, muteItems, selectedGenre]);

  const showSkeleton = isPending || (isLoading && !rawData);

  return (
    <div className="pb-8">
      {/* Sort + scope filter bar */}
      <MusicSortFilterBar
        sort={sort}
        scope={scope}
        onSortChange={setSort}
        onScopeChange={setScope}
      />

      {/* Genre chips */}
      {genreNames.length > 0 && (
        <TagChips
          tags={genreNames}
          selected={selectedGenre}
          onSelect={setSelectedGenre}
        />
      )}

      {/* Track list */}
      {showSkeleton ? (
        <div>
          {Array.from({ length: 10 }).map((_, i) => (
            <MusicTrackRowSkeleton key={i} />
          ))}
        </div>
      ) : trackEvents.length > 0 ? (
        <div>
          {trackEvents.map((ev, i) => (
            <MusicTrackRow key={ev.id} event={ev} index={i} />
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
        <p className="px-4 py-12 text-sm text-muted-foreground text-center">
          {selectedGenre
            ? `No ${selectedGenre} tracks found. Try a different genre.`
            : scope === 'following'
              ? 'No tracks from people you follow yet.'
              : 'No music tracks yet. Check back soon!'}
        </p>
      )}
    </div>
  );
}
