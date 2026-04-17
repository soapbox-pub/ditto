import { useState, useMemo, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import type { NostrEvent } from '@nostrify/nostrify';
import { useFeed } from '@/hooks/useFeed';
import { useMusicData } from '@/hooks/useMusicData';
import { useMuteList } from '@/hooks/useMuteList';
import { parseMusicTrack } from '@/lib/musicHelpers';
import { isEventMuted } from '@/lib/muteHelpers';
import { TagChips } from '@/components/discovery/TagChips';
import { MusicTrackRow, MusicTrackRowSkeleton } from './MusicTrackRow';
import type { FeedItem } from '@/lib/feedUtils';

/**
 * The "Tracks" tab — infinite scroll list of all music tracks.
 *
 * Uses `useFeed` with `kinds: [36787]` for standard infinite-scroll pagination.
 * Includes genre chip filtering at the top. When a genre is selected, filters
 * client-side from the loaded events.
 */
export function MusicTracksTab() {
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const { muteItems } = useMuteList();

  // Base query for genre names only (reuses cached data from Discover tab)
  const { genres } = useMusicData();
  const genreNames = useMemo(() => genres.slice(0, 12).map((g) => g.genre), [genres]);

  // Infinite-scroll feed for all music tracks
  const feedQuery = useFeed('global', { kinds: [36787] });
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

    const events: NostrEvent[] = (rawData.pages as unknown as { items: FeedItem[] }[])
      .flatMap((page) => page.items)
      .map((item) => item.event)
      .filter((event) => {
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

    return events;
  }, [rawData?.pages, muteItems, selectedGenre]);

  const showSkeleton = isPending || (isLoading && !rawData);

  return (
    <div className="pb-8">
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
            : 'No music tracks yet. Check back soon!'}
        </p>
      )}
    </div>
  );
}
