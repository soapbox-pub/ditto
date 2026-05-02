/**
 * Room Layout Defaults — static fallback room layouts.
 *
 * Used when CSS theme variables are unavailable (SSR, tests, etc.).
 * Each room has a distinct visual identity matching the theme-aware
 * defaults in room-theme-defaults.ts.
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
    // Wardrobe: neutral wall, dark walnut wood floor
    wall: { style: 'solid', palette: ['#fafaf9', '#f0f0ee'] },
    floor: { style: 'wood', palette: ['#92400e', '#78350f'], variant: 'medium' },
  },
};
