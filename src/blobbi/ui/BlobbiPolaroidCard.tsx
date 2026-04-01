/**
 * BlobbiPolaroidCard - Polaroid-style card for Blobbi photos
 *
 * Renders a Blobbi inside a classic polaroid-style frame with:
 * - White/off-white border on ALL sides (like a real polaroid)
 * - Thin borders on top, left, and right
 * - Larger bottom border for caption area
 * - Inner photo area with gradient background
 *
 * Built using HTML + CSS (NOT canvas) for easy customization.
 * Fixed dimensions ensure consistent export results.
 */

import { forwardRef } from 'react';

import { BlobbiStageVisual } from './BlobbiStageVisual';
import { cn } from '@/lib/utils';
import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';

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

// Classic polaroid proportions with white frame on all sides
const CARD_WIDTH = 320;
const CARD_HEIGHT = 400;

// Frame padding (white border around photo)
const FRAME_PADDING_TOP = 16;
const FRAME_PADDING_SIDE = 16;
const FRAME_PADDING_BOTTOM = 80; // Larger bottom for caption

// Derived photo area dimensions
const PHOTO_WIDTH = CARD_WIDTH - FRAME_PADDING_SIDE * 2;
const PHOTO_HEIGHT = CARD_HEIGHT - FRAME_PADDING_TOP - FRAME_PADDING_BOTTOM;

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
          'bg-[#fafafa]', // Off-white polaroid background (consistent for export)
          'rounded-sm',
          'shadow-lg',
          className
        )}
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          // Explicit padding creates the white frame on all sides
          paddingTop: FRAME_PADDING_TOP,
          paddingLeft: FRAME_PADDING_SIDE,
          paddingRight: FRAME_PADDING_SIDE,
          paddingBottom: FRAME_PADDING_BOTTOM,
        }}
      >
        {/* Photo area - inner frame with gradient background */}
        <div
          className="relative flex items-center justify-center overflow-hidden"
          style={{
            width: PHOTO_WIDTH,
            height: PHOTO_HEIGHT,
            // Soft gradient background
            background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 50%, #ddd6fe 100%)',
          }}
        >
          {/* Subtle vignette overlay for depth */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.08) 100%)',
            }}
          />

          {/* Blobbi visual - centered, forward looking, no blink for photo */}
          <BlobbiStageVisual
            companion={companion}
            size="lg"
            animated={false} // No animations for photo capture
            lookMode="forward" // Eyes look straight ahead
            disableBlink // Eyes stay fully open (no blinking during capture)
            className="size-48 z-10"
          />
        </div>

        {/* Caption area - positioned at bottom of polaroid frame */}
        {/* Uses inline styles for consistent html-to-image export */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: FRAME_PADDING_BOTTOM,
            paddingBottom: 12,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: CARD_WIDTH,
          }}
        >
          {/* Blobbi name - handwritten style */}
          <p
            style={{
              fontFamily: "'Permanent Marker', 'Comic Sans MS', cursive, sans-serif",
              fontSize: '1.25rem',
              fontWeight: 500,
              color: '#1f2937',
              textAlign: 'center',
              letterSpacing: '0.02em',
              maxWidth: '90%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              margin: 0,
            }}
          >
            {displayCaption}
          </p>

          {/* Optional stage badge */}
          {showStage && (
            <span
              style={{
                marginTop: 4,
                fontSize: '0.75rem',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
              }}
            >
              {stageLabel}
            </span>
          )}

          {/* Date - subtle timestamp, forced single line */}
          <div
            style={{
              marginTop: 6,
              fontSize: 10,
              color: '#9ca3af',
              whiteSpace: 'nowrap',
            }}
          >
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
