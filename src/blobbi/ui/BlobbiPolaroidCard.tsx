/**
 * BlobbiPolaroidCard - Polaroid-style card for Blobbi photos
 *
 * Renders a Blobbi inside a classic polaroid-style frame with:
 * - White/off-white background
 * - Subtle shadow
 * - Slightly rounded corners
 * - Thicker bottom area for name/caption
 *
 * Built using HTML + CSS (NOT canvas) for easy customization.
 * Fixed dimensions ensure consistent export results.
 */

import { forwardRef } from 'react';

import { BlobbiStageVisual } from './BlobbiStageVisual';
import { cn } from '@/lib/utils';
import type { BlobbiCompanion } from '@/lib/blobbi';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BlobbiPolaroidCardProps {
  /** The Blobbi companion data */
  companion: BlobbiCompanion;
  /** Optional caption text (defaults to Blobbi name) */
  caption?: string;
  /** Show stage badge (e.g., "Baby", "Adult") */
  showStage?: boolean;
  /** Additional CSS classes for the outer container */
  className?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Fixed dimensions for consistent export (3:4 aspect ratio like classic polaroid)
const CARD_WIDTH = 320;
const CARD_HEIGHT = 400;
const PHOTO_AREA_HEIGHT = 300;
const CAPTION_AREA_HEIGHT = 100;

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Polaroid-style card for Blobbi photos.
 *
 * Uses forwardRef to allow parent components to capture the DOM node
 * for image export using html-to-image.
 */
export const BlobbiPolaroidCard = forwardRef<HTMLDivElement, BlobbiPolaroidCardProps>(
  function BlobbiPolaroidCard({ companion, caption, showStage = false, className }, ref) {
    const displayCaption = caption ?? companion.name;
    const stageLabel = companion.stage.charAt(0).toUpperCase() + companion.stage.slice(1);

    return (
      <div
        ref={ref}
        className={cn(
          'relative flex flex-col',
          'bg-[#fefefe] dark:bg-[#f5f5f0]', // Off-white background
          'rounded-sm',
          'shadow-lg',
          className
        )}
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
        }}
      >
        {/* Photo area with gradient background */}
        <div
          className="relative flex items-center justify-center overflow-hidden"
          style={{
            height: PHOTO_AREA_HEIGHT,
            // Soft gradient background
            background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 50%, #ddd6fe 100%)',
          }}
        >
          {/* Subtle vignette overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.08) 100%)',
            }}
          />

          {/* Blobbi visual - forward looking for photo */}
          <BlobbiStageVisual
            companion={companion}
            size="lg"
            animated={false} // No animations for photo capture
            lookMode="forward" // Eyes look straight ahead
            className="size-48 z-10"
          />
        </div>

        {/* Caption area (thicker bottom like classic polaroid) */}
        <div
          className="flex flex-col items-center justify-center px-4"
          style={{ height: CAPTION_AREA_HEIGHT }}
        >
          {/* Blobbi name */}
          <p
            className="text-xl font-medium text-gray-800 dark:text-gray-800 text-center truncate max-w-full"
            style={{
              fontFamily: "'Permanent Marker', 'Comic Sans MS', cursive, sans-serif",
              letterSpacing: '0.02em',
            }}
          >
            {displayCaption}
          </p>

          {/* Optional stage badge */}
          {showStage && (
            <span className="mt-1.5 text-xs text-gray-500 dark:text-gray-500 uppercase tracking-wider">
              {stageLabel}
            </span>
          )}

          {/* Optional date or decorative element */}
          <div className="mt-2 text-[10px] text-gray-400 dark:text-gray-400">
            {new Date().toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
        </div>
      </div>
    );
  }
);
