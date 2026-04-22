import { useMemo, useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import { useMusicFeed } from '@/hooks/useMusicFeed';
import { MusicPlaylistCard, MusicPlaylistCardSkeleton } from './MusicPlaylistCard';
import { MusicSortFilterBar, type MusicSort, type MusicScope } from './MusicSortFilterBar';
import { parseMusicPlaylist } from '@/lib/musicHelpers';
import { cn } from '@/lib/utils';

type FilterMode = 'all' | 'playlists' | 'albums';

/**
 * The "Playlists" tab — 2-column grid of playlist cards with sort, scope, and
 * album/playlist type filters.
 *
 * **Sort**: Hot (engagement + decay), Top (total engagement), New (chronological)
 * **Scope**: Global (all authors) or Following (user's follow list)
 * **Type filter**: All / Playlists / Albums
 */
export function MusicPlaylistsTab() {
  const [sort, setSort] = useState<MusicSort>('new');
  const [scope, setScope] = useState<MusicScope>('global');
  const [filter, setFilter] = useState<FilterMode>('all');

  // Infinite-scroll feed with sort + scope
  const feedQuery = useMusicFeed({ kind: 34139, sort, scope });
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

  // Flatten, deduplicate, validate
  const allPlaylists = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();
    return rawData.pages.flat().filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return parseMusicPlaylist(event) !== null;
    });
  }, [rawData?.pages]);

  // Album/playlist type filter
  const filtered = useMemo(() => {
    if (filter === 'all') return allPlaylists;
    return allPlaylists.filter((ev) => {
      const parsed = parseMusicPlaylist(ev);
      if (!parsed) return false;
      return filter === 'albums' ? parsed.isAlbum : !parsed.isAlbum;
    });
  }, [allPlaylists, filter]);

  // Only show type toggle if there are both albums and non-albums
  const hasAlbums = useMemo(() => {
    return allPlaylists.some((ev) => parseMusicPlaylist(ev)?.isAlbum);
  }, [allPlaylists]);

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

      {/* Album/playlist type toggle */}
      {hasAlbums && (
        <div className="px-4 pb-2">
          <div className="flex gap-1 p-1 rounded-lg bg-secondary/40 w-fit">
            {(['all', 'playlists', 'albums'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilter(mode)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize',
                  filter === mode
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Playlist grid */}
      {isError ? (
        <p className="px-4 py-12 text-sm text-muted-foreground text-center">
          Failed to load playlists. Check your relay connections and try again.
        </p>
      ) : showSkeleton ? (
        <div className="px-4 pt-2">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <MusicPlaylistCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : filtered.length > 0 ? (
        <div className="px-4 pt-2">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {filtered.map((ev) => (
              <MusicPlaylistCard key={ev.id} event={ev} />
            ))}
          </div>
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
          {scope === 'following'
            ? `No ${filter === 'albums' ? 'albums' : 'playlists'} from people you follow yet.`
            : `No ${filter === 'albums' ? 'albums' : 'playlists'} yet. Check back soon!`}
        </p>
      )}
    </div>
  );
}
