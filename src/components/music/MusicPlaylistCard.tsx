import { useMemo } from 'react';
import { Disc3, ListMusic } from 'lucide-react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { parseMusicPlaylist } from '@/lib/musicHelpers';
import { Skeleton } from '@/components/ui/skeleton';

interface MusicPlaylistCardProps {
  /** The music playlist event. */
  event: NostrEvent;
}

/**
 * Playlist card for horizontal scroll sections and the Playlists tab grid.
 *
 * Layout: [square artwork] + [title] + [track count]
 *
 * **States**:
 * - Default: Artwork with title and track count below
 * - No artwork: Gradient fallback with ListMusic icon
 */
export function MusicPlaylistCard({ event }: MusicPlaylistCardProps) {
  const parsed = useMemo(() => parseMusicPlaylist(event), [event]);

  const naddrPath = useMemo(() => {
    const d = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    return '/' + nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: d });
  }, [event]);

  if (!parsed) return null;

  const trackCount = parsed.trackRefs.length;

  return (
    <Link to={naddrPath} className="w-[160px] shrink-0 cursor-pointer group">
      {/* Artwork */}
      <div className="w-full aspect-square rounded-xl overflow-hidden">
        {parsed.artwork ? (
          <img
            src={parsed.artwork}
            alt={parsed.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/15 via-primary/5 to-transparent flex items-center justify-center">
            <ListMusic className="size-10 text-primary/20" />
          </div>
        )}
      </div>

      {/* Info */}
      <p className="text-sm font-medium truncate mt-2 group-hover:text-primary transition-colors">
        {parsed.title}
      </p>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {parsed.isAlbum && (
          <span className="inline-flex items-center gap-0.5 font-medium text-primary/70">
            <Disc3 className="size-3" />Album
          </span>
        )}
        {parsed.isAlbum && trackCount > 0 && <span>·</span>}
        {trackCount > 0 && (
          <span>{trackCount} track{trackCount !== 1 ? 's' : ''}</span>
        )}
      </div>
    </Link>
  );
}

/** Loading skeleton matching MusicPlaylistCard dimensions. */
export function MusicPlaylistCardSkeleton() {
  return (
    <div className="w-[160px] shrink-0">
      <Skeleton className="w-full aspect-square rounded-xl" />
      <Skeleton className="h-4 w-3/4 mt-2" />
      <Skeleton className="h-3 w-12 mt-1" />
    </div>
  );
}
