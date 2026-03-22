import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { cn } from '@/lib/utils';

interface ArchiveOrgEmbedProps {
  identifier: string;
  className?: string;
}

/** Fetch the dimensions of the primary media file from the archive.org metadata API. */
function useArchiveOrgDimensions(identifier: string) {
  return useQuery({
    queryKey: ['archive-org-dims', identifier],
    queryFn: async ({ signal }): Promise<{ width: number; height: number } | null> => {
      const res = await fetch(`https://archive.org/metadata/${identifier}/files`, { signal });
      if (!res.ok) return null;

      const json: { result: { width?: string; height?: string; source?: string }[] } = await res.json();
      const files = json.result;

      // Prefer the original source file with dimensions, fall back to any file with dimensions.
      const withDims = files.filter((f) => f.width && f.height);
      const original = withDims.find((f) => f.source === 'original') ?? withDims[0];
      if (!original) return null;

      const w = Number(original.width);
      const h = Number(original.height);
      if (!w || !h) return null;

      return { width: w, height: h };
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
 * - Metadata:  `https://archive.org/metadata/{identifier}/files`
 *
 * The embed page renders the appropriate player for the content type
 * (video, audio, software emulation, book reader, etc.).
 *
 * Unlike YouTube, the archive.org embed renders content at its native pixel
 * size and doesn't scale to fill the iframe. To handle narrow viewports we
 * give the iframe its native dimensions and use CSS `transform: scale()` to
 * shrink it to fit the container width.
 */
export function ArchiveOrgEmbed({ identifier, className }: ArchiveOrgEmbedProps) {
  const [activated, setActivated] = useState(false);
  const { data: dims } = useArchiveOrgDimensions(identifier);
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
    // Capture initial width synchronously.
    setContainerWidth(node.getBoundingClientRect().width);
    observerRef.current = ro;
  }, []);
  const observerRef = useRef<ResizeObserver | null>(null);

  const thumbnailSrc = `https://archive.org/services/img/${identifier}`;

  // Native dimensions (fallback to a common 4:3 size).
  const nativeW = dims?.width ?? 640;
  const nativeH = dims?.height ?? 480;

  // Scale factor: shrink when the container is narrower than the native width.
  const scale = containerWidth > 0 ? Math.min(1, containerWidth / nativeW) : 1;
  const scaledH = nativeH * scale;

  // Padding-bottom for the thumbnail facade (before activation).
  const paddingBottom = `${(nativeH / nativeW) * 100}%`;

  return (
    <div
      ref={containerRef}
      className={cn('rounded-2xl overflow-hidden border border-border', className)}
      onClick={(e) => e.stopPropagation()}
    >
      {activated ? (
        <div className="relative overflow-hidden bg-black" style={{ height: scaledH }}>
          <iframe
            src={`https://archive.org/embed/${identifier}`}
            title="Internet Archive"
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
