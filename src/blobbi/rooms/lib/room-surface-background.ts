/**
 * Room Surface Background — shared CSS background generator.
 *
 * Used by BlobbiRoomShell (actual room), RoomPreviewCard, and PatternSwatch
 * to ensure consistent rendering between preview and live room.
 *
 * Security: only operates on validated hex colors and numeric angle/variant.
 * No raw CSS strings accepted from outside.
 */

import type { RoomSurfaceLayout } from './room-layout-schema';

/** Circular angle distance that wraps correctly around 0°/360° */
function angleDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

/**
 * Generate a CSS background string for a given surface layout.
 *
 * @param surface - Validated surface layout (style, palette, variant, angle)
 * @param scale - Optional scale multiplier for pattern sizing (default 1).
 *               Use < 1 for smaller previews (e.g. 0.6 for swatch).
 */
export function getSurfaceBackground(surface: RoomSurfaceLayout, scale = 1): string {
  const [c1, c2] = surface.palette;
  if (!c1) return '#ccc';
  const angle = surface.angle ?? 0;

  switch (surface.style) {
    case 'solid':
      return c1;

    case 'gradient':
      return c2
        ? `linear-gradient(${angle || 180}deg, ${c1} 0%, ${c2} 100%)`
        : c1;

    case 'stripes': {
      // variant controls plank width; soft/medium/bold control contrast
      const baseSize = surface.variant === 'narrow' ? 8 : surface.variant === 'wide' ? 24 : 14;
      const size = Math.round(baseSize * scale);
      // soft/bold affect the accent stripe opacity
      const accentAlpha = surface.variant === 'soft' ? '90' : surface.variant === 'bold' ? '' : 'cc';
      const accent = c2 ? `${c2}${accentAlpha}` : c1;
      return `repeating-linear-gradient(${angle || 180}deg, ${c1} 0px, ${c1} ${size}px, ${accent} ${size}px, ${accent} ${size * 2}px)`;
    }

    case 'dots': {
      // Angle offsets the dot grid using background-position shift
      const dotSize = Math.round(20 * scale);
      const radius = Math.max(1.5, 3 * scale);
      // Compute a diagonal offset from angle to shift the grid pattern
      const rad = (angle * Math.PI) / 180;
      const offsetX = Math.round(Math.cos(rad) * dotSize * 0.4);
      const offsetY = Math.round(Math.sin(rad) * dotSize * 0.4);
      return c2
        ? `radial-gradient(circle ${radius}px at ${dotSize / 2}px ${dotSize / 2}px, ${c2} ${radius * 0.7}px, transparent ${radius}px) ${offsetX}px ${offsetY}px / ${dotSize}px ${dotSize}px, ${c1}`
        : c1;
    }

    case 'wood': {
      // narrow/wide control plank width; soft/medium/bold control grain contrast
      const baseWidth = surface.variant === 'narrow' ? 8 : surface.variant === 'wide' ? 22 : 14;
      const grainWidth = surface.variant === 'bold' ? 4 : surface.variant === 'soft' ? 1 : 2;
      const plankSize = Math.round(baseWidth * scale);
      const grain = Math.max(1, Math.round(grainWidth * scale));
      return c2
        ? `repeating-linear-gradient(${angle || 90}deg, ${c1} 0px, ${c1} ${plankSize}px, ${c2} ${plankSize}px, ${c2} ${plankSize + grain}px)`
        : c1;
    }

    case 'tile': {
      // Ceramic tile: visible grout lines forming a grid.
      // Square grid for 0°/90°/180°/270°; diamond grid for 45°/135°/225°/315°.
      const tileSize = Math.round(28 * scale);
      const grout = Math.max(1, Math.round(2 * scale));
      const groutColor = c2 ? `${c2}60` : '#00000020';

      // Determine if angle is diagonal (within 10° of 45/135/225/315)
      const normAngle = ((angle % 360) + 360) % 360;
      const isDiagonal = [45, 135, 225, 315].some(d => angleDistance(normAngle, d) <= 10);

      if (isDiagonal) {
        // Diamond tile: two diagonal lines at 45° and 135° with adjusted tile size
        // so the diagonal repeat forms clear diamond shapes
        const diagSize = Math.round(tileSize * 0.707); // sqrt(2)/2 for diagonal spacing
        return [
          `repeating-linear-gradient(45deg, ${groutColor} 0px, ${groutColor} ${grout}px, transparent ${grout}px, transparent ${diagSize}px)`,
          `repeating-linear-gradient(-45deg, ${groutColor} 0px, ${groutColor} ${grout}px, transparent ${grout}px, transparent ${diagSize}px)`,
          c1,
        ].join(', ');
      }

      // Square tile grid: horizontal + vertical grout lines
      return [
        `repeating-linear-gradient(0deg, ${groutColor} 0px, ${groutColor} ${grout}px, transparent ${grout}px, transparent ${tileSize}px)`,
        `repeating-linear-gradient(90deg, ${groutColor} 0px, ${groutColor} ${grout}px, transparent ${grout}px, transparent ${tileSize}px)`,
        c1,
      ].join(', ');
    }

    case 'carpet':
      return c2
        ? `linear-gradient(${angle || 135}deg, ${c1} 0%, ${c2} 100%)`
        : c1;

    default:
      return c1;
  }
}
