import { useState, useMemo, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { FormattedMessage } from 'react-intl';
import { useInView } from '@/hooks/useInView';
import type { NostrEvent } from '@nostrify/nostrify';
import { useMusicFeed } from '@/hooks/useMusicFeed';
import { useMusicData } from '@/hooks/useMusicData';
import { useMuteFilter } from '@/hooks/useMuteFilter';
import { parseMusicTrack } from '@/lib/musicHelpers';
import { TagChips } from '@/components/discovery/TagChips';
import { MusicSortFilterBar, type MusicSort, type MusicScope } from './MusicSortFilterBar';
import { MusicTrackRow, MusicTrackRowSkeleton } from './MusicTrackRow';

/**
 * The "Tracks" tab — infinite scroll list of music tracks.
 *
 * Features:
 * - **Sort**: Hot (engagement + decay), Top (total engagement), New (chronological)
 * - **Scope**: Discover (the viewer's network) or Following (user's follow list)
 * - **Genre filter**: Relay-level `#t` tag filtering via TagChips
 */
export function MusicTracksTab() {
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [sort, setSort] = useState<MusicSort>('new');
  const [scope, setScope] = useState<MusicScope>('global');
  const { isMuted } = useMuteFilter();

  // Base query for genre names only (reuses cached data from Discover tab)
  const { genres } = useMusicData();
  const genreNames = useMemo(() => genres.slice(0, 12).map((g) => g.genre), [genres]);

  // Infinite-scroll feed with sort + scope + genre
  const feedQuery = useMusicFeed({ kind: 36787, sort, scope, genre: selectedGenre });
  const {
    data: rawData,
    isPending,
    isLoading,
    isError,
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
        if (isMuted(event)) return false;
        return true;
      });
  }, [rawData?.pages, isMuted]);

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
      {isError ? (
        <p className="px-4 py-12 text-sm text-muted-foreground text-center">
          <FormattedMessage id="musicTracks.loadFailed" defaultMessage="Failed to load tracks. Check your relay connections and try again." />
        </p>
      ) : showSkeleton ? (
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
          {selectedGenre ? (
            <FormattedMessage
              id="musicTracks.emptyGenre"
              defaultMessage="No {genre} tracks found. Try a different genre."
              values={{ genre: selectedGenre }}
            />
          ) : scope === 'following' ? (
            <FormattedMessage id="musicTracks.emptyFollowing" defaultMessage="No tracks from people you follow yet." />
          ) : (
            <FormattedMessage id="musicTracks.empty" defaultMessage="No music tracks yet. Check back soon!" />
          )}
        </p>
      )}
    </div>
  );
}
