import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { cn } from '@/lib/utils';

interface ArchiveOrgEmbedProps {
  identifier: string;
  className?: string;
}

interface ArchiveOrgMeta {
  /** Native width/height of the primary media file, if available. */
  dims: { width: number; height: number } | null;
  /** The item's mediatype (e.g. "software", "movies", "audio", "texts"). */
  mediatype: string | null;
}

/** Fetch metadata for an archive.org item: dimensions and mediatype. */
function useArchiveOrgMeta(identifier: string) {
  return useQuery({
    queryKey: ['archive-org-meta', identifier],
    queryFn: async ({ signal }): Promise<ArchiveOrgMeta> => {
      const res = await fetch(`https://archive.org/metadata/${identifier}`, { signal });
      if (!res.ok) return { dims: null, mediatype: null };

      const json: {
        metadata?: { mediatype?: string };
        files?: { width?: string; height?: string; source?: string }[];
      } = await res.json();

      const mediatype = json.metadata?.mediatype ?? null;

      // Extract dimensions from the files list.
      const files = json.files ?? [];
      const withDims = files.filter((f) => f.width && f.height);
      const original = withDims.find((f) => f.source === 'original') ?? withDims[0];

      let dims: { width: number; height: number } | null = null;
      if (original) {
        const w = Number(original.width);
        const h = Number(original.height);
        if (w && h) dims = { width: w, height: h };
      }

      return { dims, mediatype };
    },
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    retry: false,
  });
}

/**
 * Renders an Internet Archive embed with a click-to-load facade.
 *
 * Shows a thumbnail and play button instead of mounting the iframe immediately,
 * so no requests are made to archive.org until the user explicitly clicks.
 *
 * Archive.org provides:
 * - Thumbnail: `https://archive.org/services/img/{identifier}`
 * - Embed:     `https://archive.org/embed/{identifier}`
 * - Metadata:  `https://archive.org/metadata/{identifier}`
 *
 * The embed page renders the appropriate player for the content type
 * (video, audio, software emulation, book reader, etc.).
 *
 * For software/games, the archive.org embed renders content at its native
 * pixel size and doesn't scale to fill the iframe. We use CSS
 * `transform: scale()` to shrink these to fit narrow viewports.
 *
 * For videos and other media, the embed page has a responsive player,
 * so we use a standard responsive iframe approach.
 */
export function ArchiveOrgEmbed({ identifier, className }: ArchiveOrgEmbedProps) {
  const [activated, setActivated] = useState(false);
  const { data: meta } = useArchiveOrgMeta(identifier);
  const [containerWidth, setContainerWidth] = useState(0);

  // Measure the outer container width on mount/resize via ResizeObserver.
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(node);
    setContainerWidth(node.getBoundingClientRect().width);
    observerRef.current = ro;
  }, []);
  const observerRef = useRef<ResizeObserver | null>(null);

  const thumbnailSrc = `https://archive.org/services/img/${identifier}`;

  // Software/games need the transform-scale approach because their embed
  // renders at fixed native pixel dimensions.
  const isSoftware = meta?.mediatype === 'software';

  const nativeW = meta?.dims?.width ?? 640;
  const nativeH = meta?.dims?.height ?? 480;
  const paddingBottom = `${(nativeH / nativeW) * 100}%`;

  // Scale factor for software embeds.
  const scale = containerWidth > 0 ? Math.min(1, containerWidth / nativeW) : 1;
  const scaledH = nativeH * scale;

  return (
    <div
      ref={containerRef}
      className={cn('rounded-2xl overflow-hidden border border-border', className)}
      onClick={(e) => e.stopPropagation()}
    >
      {activated ? (
        isSoftware ? (
          // Software/games: fixed-size iframe scaled down with CSS transform.
          <div className="relative overflow-hidden bg-black" style={{ height: scaledH }}>
            <iframe
              src={`https://archive.org/embed/${identifier}&autoplay=1`}
              title="Internet Archive"
              allow="autoplay"
              allowFullScreen
              style={{
                width: nativeW,
                height: nativeH,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                border: 'none',
              }}
            />
          </div>
        ) : (
          // Videos and other media: standard responsive iframe.
          <div className="relative w-full" style={{ paddingBottom }}>
            <iframe
              src={`https://archive.org/embed/${identifier}&autoplay=1`}
              title="Internet Archive"
              allow="autoplay"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          </div>
        )
      ) : (
        <div className="relative w-full" style={{ paddingBottom }}>
          <button
            type="button"
            className="absolute inset-0 w-full h-full cursor-pointer bg-black group"
            onClick={() => setActivated(true)}
            aria-label="Load content"
          >
            <img
              src={thumbnailSrc}
              alt=""
              className="absolute inset-0 w-full h-full object-contain"
            />

            {/* Play button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className={cn(
                  'flex items-center justify-center',
                  'w-[68px] h-[48px] rounded-xl',
                  'bg-[#212121]/80 group-hover:bg-[#428bca] transition-colors duration-200',
                )}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white ml-0.5">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
