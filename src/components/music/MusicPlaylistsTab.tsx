import { useMemo, useState } from 'react';
import { useMusicPlaylists } from '@/hooks/useMusicPlaylists';
import { MusicPlaylistCard, MusicPlaylistCardSkeleton } from './MusicPlaylistCard';
import { parseMusicPlaylist } from '@/lib/musicHelpers';
import { cn } from '@/lib/utils';

type FilterMode = 'all' | 'playlists' | 'albums';

/**
 * The "Playlists" tab — 2-column grid of playlist cards with filter toggle.
 *
 * **Filter modes**:
 * - All: Shows both playlists and albums
 * - Playlists: Only non-album playlists
 * - Albums: Only playlists tagged with `t:album`
 *
 * **States**:
 * - Loading: Grid of skeleton cards
 * - Empty: Centered message
 * - Loaded: Grid of playlist cards
 */
export function MusicPlaylistsTab() {
  const { data: playlists, isLoading } = useMusicPlaylists({ limit: 50 });
  const [filter, setFilter] = useState<FilterMode>('all');

  const filtered = useMemo(() => {
    if (!playlists) return [];
    if (filter === 'all') return playlists;
    return playlists.filter((ev) => {
      const parsed = parseMusicPlaylist(ev);
      if (!parsed) return false;
      return filter === 'albums' ? parsed.isAlbum : !parsed.isAlbum;
    });
  }, [playlists, filter]);

  // Only show toggle if there are both albums and non-albums
  const hasAlbums = useMemo(() => {
    if (!playlists) return false;
    return playlists.some((ev) => parseMusicPlaylist(ev)?.isAlbum);
  }, [playlists]);

  if (isLoading) {
    return (
      <div className="px-4 pt-4 pb-8">
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <MusicPlaylistCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!playlists || playlists.length === 0) {
    return (
      <p className="px-4 py-12 text-sm text-muted-foreground text-center">
        No playlists yet. Check back soon!
      </p>
    );
  }

  return (
    <div className="px-4 pt-4 pb-8">
      {/* Filter toggle — only shown when albums exist */}
      {hasAlbums && (
        <div className="flex gap-1 mb-4 p-1 rounded-lg bg-secondary/40 w-fit">
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
      )}

      {filtered.length === 0 ? (
        <p className="py-12 text-sm text-muted-foreground text-center">
          No {filter === 'albums' ? 'albums' : 'playlists'} found.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((ev) => (
            <MusicPlaylistCard key={ev.id} event={ev} />
          ))}
        </div>
      )}
    </div>
  );
}
