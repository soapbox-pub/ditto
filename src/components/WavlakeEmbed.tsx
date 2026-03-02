import { cn } from '@/lib/utils';

interface WavlakeEmbedProps {
  /** Wavlake content type (track or album). */
  type: 'track' | 'album';
  /** Wavlake content UUID. */
  id: string;
  className?: string;
}

/** Height in px for each Wavlake embed type. */
const HEIGHTS: Record<string, number> = {
  track: 380,
  album: 480,
};

/**
 * Renders a Wavlake embed using an iframe to `embed.wavlake.com`.
 * Supports both single tracks and full albums with track listings.
 */
export function WavlakeEmbed({ type, id, className }: WavlakeEmbedProps) {
  const height = HEIGHTS[type] ?? 380;
  const embedUrl = `https://embed.wavlake.com/${type}/${id}`;

  return (
    <div className={cn('overflow-hidden rounded-2xl', className)}>
      <iframe
        src={embedUrl}
        title="Wavlake"
        className="w-full border-0 rounded-2xl"
        height={height}
        allowFullScreen
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>
  );
}
