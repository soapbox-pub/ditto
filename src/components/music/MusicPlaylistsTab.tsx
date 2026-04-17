import { useMusicPlaylists } from '@/hooks/useMusicPlaylists';
import { MusicPlaylistCard, MusicPlaylistCardSkeleton } from './MusicPlaylistCard';

/**
 * The "Playlists" tab — 2-column grid of playlist cards.
 *
 * **States**:
 * - Loading: Grid of skeleton cards
 * - Empty: Centered message
 * - Loaded: Grid of playlist cards
 */
export function MusicPlaylistsTab() {
  const { data: playlists, isLoading } = useMusicPlaylists({ limit: 50 });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 px-4 pt-4 pb-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <MusicPlaylistCardSkeleton key={i} />
        ))}
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
    <div className="grid grid-cols-2 gap-3 px-4 pt-4 pb-8">
      {playlists.map((ev) => (
        <MusicPlaylistCard key={ev.id} event={ev} />
      ))}
    </div>
  );
}
