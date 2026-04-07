// src/blobbi/rooms/scene/components/WallLayer.tsx

/**
 * WallLayer — Renders the wall surface behind Blobbi.
 *
 * The wall is always front-facing (no perspective transform). Different
 * wall types produce different visual textures on top of the base color:
 *
 *   - paint:     Solid color with a subtle depth gradient
 *   - wallpaper: Repeating pattern overlay (diamond/dots)
 *   - brick:     Brick masonry pattern via CSS gradients
 *
 * The component fills its parent container entirely.
 */

import { useMemo, useId } from 'react';
import { darkenHex, lightenHex } from '@/lib/colorUtils';
import type { WallConfig } from '../types';

interface WallLayerProps {
  config: WallConfig;
}

export function WallLayer({ config }: WallLayerProps) {
  const { type, color, accentColor } = config;

  switch (type) {
    case 'paint':
      return <PaintWall color={color} />;
    case 'wallpaper':
      return <WallpaperWall color={color} accentColor={accentColor} />;
    case 'brick':
      return <BrickWall color={color} accentColor={accentColor} />;
    default:
      return <PaintWall color={color} />;
  }
}

// ─── Paint Wall ───────────────────────────────────────────────────────────────

function PaintWall({ color }: { color: string }) {
  // Subtle gradient from slightly lighter at top to slightly darker at bottom
  // simulates the natural light fall-off in a room.
  const topColor = lightenHex(color, 0.04);
  const bottomColor = darkenHex(color, 0.06);

  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${topColor} 0%, ${color} 40%, ${bottomColor} 100%)`,
        }}
      />
      {/* Very subtle noise texture for a painted-surface feel */}
      <div
        className="absolute inset-0 opacity-[0.03] mix-blend-multiply"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px',
        }}
      />
    </div>
  );
}

// ─── Wallpaper Wall ───────────────────────────────────────────────────────────

function WallpaperWall({ color, accentColor }: { color: string; accentColor?: string }) {
  const patternId = useId();
  const patternColor = accentColor ?? darkenHex(color, 0.15);

  return (
    <div className="absolute inset-0" style={{ backgroundColor: color }}>
      {/* SVG diamond trellis pattern */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <defs>
          <pattern
            id={patternId}
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            {/* Small diamond at center */}
            <path
              d="M12 2 L22 12 L12 22 L2 12 Z"
              fill="none"
              stroke={patternColor}
              strokeWidth="0.6"
              opacity="0.15"
            />
            {/* Tiny dot at intersections */}
            <circle cx="12" cy="12" r="1" fill={patternColor} opacity="0.1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${CSS.escape(patternId)})`} />
      </svg>
      {/* Same subtle depth gradient as paint */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 40%, rgba(0,0,0,0.05) 100%)',
        }}
      />
    </div>
  );
}

// ─── Brick Wall ───────────────────────────────────────────────────────────────

function BrickWall({ color, accentColor }: { color: string; accentColor?: string }) {
  const mortarColor = accentColor ?? darkenHex(color, 0.25);

  // CSS-only brick pattern using repeating-linear-gradient
  // Creates the characteristic offset-row masonry look.
  const brickPattern = useMemo(() => {
    const brickH = 20;   // brick height in px
    const mortarW = 2;   // mortar line width
    const brickW = 50;   // brick width in px

    return {
      backgroundImage: [
        // Horizontal mortar lines
        `repeating-linear-gradient(
          180deg,
          ${mortarColor} 0px,
          ${mortarColor} ${mortarW}px,
          transparent ${mortarW}px,
          transparent ${brickH + mortarW}px
        )`,
        // Vertical mortar lines (even rows)
        `repeating-linear-gradient(
          90deg,
          ${mortarColor} 0px,
          ${mortarColor} ${mortarW}px,
          transparent ${mortarW}px,
          transparent ${brickW + mortarW}px
        )`,
      ].join(', '),
      backgroundSize: `${brickW + mortarW}px ${(brickH + mortarW) * 2}px`,
      // Offset odd rows by half a brick width
      backgroundPosition: `0 0, ${(brickW + mortarW) / 2}px ${brickH + mortarW}px`,
    };
  }, [mortarColor]);

  return (
    <div className="absolute inset-0" style={{ backgroundColor: color }}>
      <div
        className="absolute inset-0"
        style={brickPattern}
      />
      {/* Subtle depth gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 50%, rgba(0,0,0,0.08) 100%)',
        }}
      />
    </div>
  );
}
