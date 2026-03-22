import { useState } from 'react';

import { cn } from '@/lib/utils';

interface ArchiveOrgEmbedProps {
  identifier: string;
  className?: string;
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
 *
 * The embed page renders the appropriate player for the content type
 * (video, audio, software emulation, book reader, etc.).
 */
export function ArchiveOrgEmbed({ identifier, className }: ArchiveOrgEmbedProps) {
  const [activated, setActivated] = useState(false);

  const thumbnailSrc = `https://archive.org/services/img/${identifier}`;

  return (
    <div
      className={cn('rounded-2xl overflow-hidden border border-border', className)}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
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
