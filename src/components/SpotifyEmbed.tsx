import { cn } from '@/lib/utils';

interface SpotifyEmbedProps {
  /** Spotify content type (track, album, playlist, episode, show). */
  type: string;
  /** Spotify content ID. */
  id: string;
  className?: string;
}

/** Height in px for each Spotify embed type. */
const HEIGHTS: Record<string, number> = {
  track: 152,
  episode: 152,
  album: 352,
  playlist: 352,
  show: 352,
};

/**
 * Renders a Spotify embed using a direct iframe to `open.spotify.com/embed/`.
 * Uses fixed heights per content type — no resize messages needed.
 */
export function SpotifyEmbed({ type, id, className }: SpotifyEmbedProps) {
  const height = HEIGHTS[type] ?? 352;
  const embedUrl = `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;

  return (
    <div className={cn('overflow-hidden rounded-2xl', className)}>
      <iframe
        src={embedUrl}
        title="Spotify"
        className="w-full border-0 rounded-2xl"
        height={height}
        allowFullScreen
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>
  );
}
