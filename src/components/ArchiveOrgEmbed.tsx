import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { cn } from '@/lib/utils';

interface ArchiveOrgEmbedProps {
  identifier: string;
  className?: string;
}

/** Fetch the aspect ratio of the primary media file from the archive.org metadata API. */
function useArchiveOrgAspectRatio(identifier: string) {
  return useQuery({
    queryKey: ['archive-org-aspect', identifier],
    queryFn: async ({ signal }) => {
      const res = await fetch(`https://archive.org/metadata/${identifier}/files`, { signal });
      if (!res.ok) return null;

      const files: { width?: string; height?: string; source?: string }[] = await res.json();

      // Prefer the original source file with dimensions, fall back to any file with dimensions.
      const withDims = files.filter((f) => f.width && f.height);
      const original = withDims.find((f) => f.source === 'original') ?? withDims[0];
      if (!original) return null;

      const w = Number(original.width);
      const h = Number(original.height);
      if (!w || !h) return null;

      return (h / w) * 100;
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
 * The component fetches metadata to determine the correct aspect ratio
 * of the original media, falling back to 16:9 while loading or on error.
 */
export function ArchiveOrgEmbed({ identifier, className }: ArchiveOrgEmbedProps) {
  const [activated, setActivated] = useState(false);
  const { data: aspectPadding } = useArchiveOrgAspectRatio(identifier);

  const thumbnailSrc = `https://archive.org/services/img/${identifier}`;
  const paddingBottom = aspectPadding ?? 56.25; // 16:9 fallback

  return (
    <div
      className={cn('rounded-2xl overflow-hidden border border-border', className)}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative w-full" style={{ paddingBottom: `${paddingBottom}%` }}>
        {activated ? (
          <iframe
            src={`https://archive.org/embed/${identifier}`}
            title="Internet Archive"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        ) : (
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
        )}
      </div>
    </div>
  );
}
