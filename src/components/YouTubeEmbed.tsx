import { cn } from '@/lib/utils';

interface YouTubeEmbedProps {
  videoId: string;
  className?: string;
}

/** Renders a playable YouTube video embed. */
export function YouTubeEmbed({ videoId, className }: YouTubeEmbedProps) {
  return (
    <div
      className={cn('rounded-2xl overflow-hidden border border-border', className)}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title="YouTube video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
          loading="lazy"
        />
      </div>
    </div>
  );
}
