import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

interface YouTubeEmbedProps {
  videoId: string;
  className?: string;
}

/**
 * YouTube thumbnail sizes to try, in preference order.
 *
 * - `sddefault.jpg` (640×480) — available for most videos, good enough for the
 *   ~568px max render width on desktop (even on 2x Retina it's acceptable for
 *   a temporary thumbnail that gets replaced by an iframe on click)
 * - `hqdefault.jpg` (480×360) — universally available fallback with letterbox bars
 *
 * `maxresdefault.jpg` (1280×720) is omitted intentionally: it 404s for many
 * videos, and in a feed with multiple YouTube links the wasted requests add up.
 * The thumbnail is disposable — it only exists until the user clicks play.
 *
 * YouTube's CDN serves a 120×90 gray placeholder when a requested size doesn't
 * exist. We probe off-screen with `new Image()` and check naturalWidth to detect
 * this, so the gray image is never rendered visibly.
 */
const THUMBNAIL_SIZES = ['sddefault', 'hqdefault'] as const;

function thumbnailUrl(videoId: string, size: string): string {
  return `https://i.ytimg.com/vi/${videoId}/${size}.jpg`;
}

/** Probe thumbnail sizes off-screen and resolve with the first valid URL. */
function findThumbnail(videoId: string): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;

    function tryIndex(i: number) {
      if (i >= THUMBNAIL_SIZES.length) {
        if (!settled) {
          settled = true;
          resolve(null);
        }
        return;
      }

      const img = new Image();
      img.onload = () => {
        if (settled) return;
        // YouTube serves a 120×90 gray placeholder when the size doesn't exist.
        if (img.naturalWidth <= 120 && img.naturalHeight <= 90) {
          tryIndex(i + 1);
        } else {
          settled = true;
          resolve(thumbnailUrl(videoId, THUMBNAIL_SIZES[i]));
        }
      };
      img.onerror = () => {
        if (!settled) tryIndex(i + 1);
      };
      img.src = thumbnailUrl(videoId, THUMBNAIL_SIZES[i]);
    }

    tryIndex(0);
  });
}

/**
 * Renders a YouTube video embed with a privacy-respecting click-to-load facade.
 *
 * Shows a thumbnail and play button instead of mounting the iframe immediately,
 * so no requests are made to YouTube until the user explicitly clicks play.
 *
 * Probes thumbnail sizes off-screen before rendering so the gray placeholder
 * is never visible to the user.
 */
export function YouTubeEmbed({ videoId, className }: YouTubeEmbedProps) {
  const [activated, setActivated] = useState(false);
  const [resolvedThumb, setResolvedThumb] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResolvedThumb(null);

    findThumbnail(videoId).then((url) => {
      if (!cancelled) setResolvedThumb(url);
    });

    return () => { cancelled = true; };
  }, [videoId]);

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
            {resolvedThumb && (
              <img
                src={resolvedThumb}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}

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
