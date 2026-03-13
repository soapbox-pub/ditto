import { useState } from 'react';

import { cn } from '@/lib/utils';

interface YouTubeEmbedProps {
  videoId: string;
  className?: string;
}

/**
 * Renders a YouTube video embed with a privacy-respecting click-to-load facade.
 *
 * Shows a thumbnail and play button instead of mounting the iframe immediately,
 * so no requests are made to YouTube until the user explicitly clicks play.
 *
 * Uses `sddefault.jpg` (640×480) which is the most reliable thumbnail size.
 * Higher resolutions like `maxresdefault.jpg` 404 for many videos, and
 * `hqdefault.jpg` can serve a gray placeholder from some YouTube CDN edges.
 */
export function YouTubeEmbed({ videoId, className }: YouTubeEmbedProps) {
  const [activated, setActivated] = useState(false);

  return (
    <div
      className={cn('rounded-2xl overflow-hidden border border-border', className)}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        {activated ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
            title="YouTube video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        ) : (
          <button
            type="button"
            className="absolute inset-0 w-full h-full cursor-pointer bg-black group"
            onClick={() => setActivated(true)}
            aria-label="Play video"
          >
            {/* YouTube thumbnail — sddefault (640×480) is the most reliable size */}
            <img
              src={`https://i.ytimg.com/vi/${videoId}/sddefault.jpg`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />

            {/* Play button — mimics the YouTube red pill shape */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className={cn(
                  'flex items-center justify-center',
                  'w-[68px] h-[48px] rounded-xl',
                  'bg-[#212121]/80 group-hover:bg-[#ff0000] transition-colors duration-200',
                )}
              >
                {/* Play triangle */}
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white ml-0.5">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
