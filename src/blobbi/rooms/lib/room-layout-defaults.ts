/**
 * Room Layout Defaults — canonical static room layouts.
 *
 * These are the theme-independent, deterministic defaults used for:
 * - New/unconfigured accounts (no saved room layout)
 * - The editor's "Reset" action
 *
 * Each room has a designed visual identity that works well regardless
 * of the active app theme. Theme-aware defaults (which read CSS custom
 * properties at runtime) live in room-theme-defaults.ts and are only
 * applied when the user explicitly clicks "Use theme" in the editor.
 *
 * Extracted to its own file to avoid circular imports between
 * room-layout-schema.ts and room-theme-defaults.ts.
 */

import type { BlobbiRoomId } from './room-config';
import type { RoomLayout } from './room-layout-schema';

export const DEFAULT_ROOM_LAYOUTS: Record<BlobbiRoomId, RoomLayout> = {
  home: {
    // Cozy living room: warm amber gradient wall, oak wide wood floor
    wall: { style: 'gradient', palette: ['#fef9ef', '#fef3c7'] },
    floor: { style: 'wood', palette: ['#b45309', '#78350f'], variant: 'wide' },
  },
  kitchen: {
    // Bright kitchen: clean cream wall, light marble tile floor
    wall: { style: 'solid', palette: ['#fafaf9', '#f5f5f4'] },
    floor: { style: 'tile', palette: ['#f5f5f4', '#d6d3d1'] },
  },
  care: {
    // Bathroom: pale blue wall, diamond ceramic tile floor
    wall: { style: 'solid', palette: ['#f0f9ff', '#e0f2fe'] },
    floor: { style: 'tile', palette: ['#f0f9ff', '#bae6fd'], angle: 45 },
  },
  rest: {
    // Sleep room: soft lavender gradient wall, gentle purple carpet
    wall: { style: 'gradient', palette: ['#faf5ff', '#ede9fe'] },
    floor: { style: 'carpet', palette: ['#a78bfa', '#8b5cf6'], variant: 'soft' },
  },
  closet: {
    // Wardrobe: warm taupe wall, dark walnut narrow wood floor
    wall: { style: 'solid', palette: ['#faf5f0', '#f0e8df'] },
    floor: { style: 'wood', palette: ['#78350f', '#451a03'], variant: 'narrow' },
  },
};
