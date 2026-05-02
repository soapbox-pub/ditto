/**
 * Room Layout Schema — types, parser, defaults, presets, and helpers for per-room visuals.
 *
 * Stored in kind 11125 content JSON under the `room_layouts` top-level key.
 * This module handles parsing and validation; writes use serializeProfileContent.
 *
 * Security invariants:
 * - Only validated hex colors are accepted (strict regex).
 * - Style and variant values are checked against known sets.
 * - No raw CSS, HTML, SVG, class names, or arbitrary strings are accepted.
 * - Malformed data falls back to defaults; never throws.
 */

import { type BlobbiRoomId, isValidRoomId } from './room-config';

// ─── Style & Variant Enums ────────────────────────────────────────────────────

/** Wall surface styles */
export const WALL_STYLES = ['solid', 'stripes', 'dots', 'gradient'] as const;
export type WallStyle = typeof WALL_STYLES[number];

/** Floor surface styles */
export const FLOOR_STYLES = ['solid', 'wood', 'tile', 'carpet'] as const;
export type FloorStyle = typeof FLOOR_STYLES[number];

/** Surface variants (shared by wall and floor) */
export const SURFACE_VARIANTS = ['soft', 'medium', 'bold', 'wide', 'narrow'] as const;
export type SurfaceVariant = typeof SURFACE_VARIANTS[number];

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single surface (wall or floor) layout definition */
export interface RoomSurfaceLayout {
  style: WallStyle | FloorStyle;
  palette: string[];       // 1–4 validated hex colors
  variant?: SurfaceVariant;
  /** Pattern rotation in degrees (0–359). 0 = default orientation. */
  angle?: number;
}

/** Layout for one room (wall + floor) */
export interface RoomLayout {
  wall: RoomSurfaceLayout;
  floor: RoomSurfaceLayout;
}

/** Top-level content key shape */
export interface RoomLayoutsContent {
  v: 1;
  by_room: Partial<Record<BlobbiRoomId, RoomLayout>>;
}

// ─── Room Stage Constants ─────────────────────────────────────────────────────

/** Floor occupies the bottom 28% of the room viewport */
export const ROOM_FLOOR_RATIO = 0.28;

/**
 * Body-bottom inset: the percentage of the visual container that is empty space
 * below the visible body. Used to shift the container down so the visible body
 * bottom lands exactly at the room's ground line.
 *
 * Coordinate model:
 *   - The ground line is at `top: (1 - ROOM_FLOOR_RATIO) * 100%` of the shell.
 *   - The Blobbi container is positioned so its TOP edge is at the ground line,
 *     then shifted UP by `100% - bodyBottomInset` of its own height.
 *   - Result: the visible body bottom sits at the ground line.
 *
 * Per-form adult insets are derived from SVG viewBox analysis:
 *   ViewBox: 0 0 200 200. Body bottom varies by form.
 */

/** Adult form body-bottom insets (% of container height that is whitespace below body) */
const ADULT_BODY_BOTTOM_INSET: Record<string, number> = {
  bloomi:  12,   // body bottom ≈ y=175 → 12.5% gap
  breezy:  18,   // body bottom ≈ y=163 → 18.5% gap
  cacti:   15,   // body bottom ≈ y=170 → 15% gap
  catti:   15,   // body bottom ≈ y=170 → 15% gap
  cloudi:  20,   // body bottom ≈ y=160 → 20% gap (floating form)
  crysti:  14,   // body bottom ≈ y=172 → 14% gap
  droppi:  16,   // body bottom ≈ y=168 → 16% gap
  flammi:  14,   // body bottom ≈ y=172 → 14% gap
  froggi:  15,   // body bottom ≈ y=170 → 15% gap
  leafy:   12,   // body bottom ≈ y=176 → 12% gap (stems extend low)
  mushie:  15,   // body bottom ≈ y=170 → 15% gap
  owli:    16,   // body bottom ≈ y=168 → 16% gap
  pandi:   14,   // body bottom ≈ y=172 → 14% gap
  rocky:   10,   // body bottom ≈ y=180 → 10% gap (wide base)
  rosey:   13,   // body bottom ≈ y=174 → 13% gap
  starri:  16,   // body bottom ≈ y=168 → 16% gap
};

const DEFAULT_ADULT_INSET = 15;
const BABY_BODY_BOTTOM_INSET = 12;   // viewBox 0 0 100 100, body bottom ≈ y=88
const EGG_BODY_BOTTOM_INSET = 0;     // CSS div fills 100% height, no SVG whitespace

/**
 * Get the body-bottom inset for a Blobbi as a CSS percentage string.
 *
 * This represents the fraction of the visual container that is empty below the
 * visible body. Used to compute the upward shift needed so the body bottom
 * touches the ground line.
 *
 * @param stage - 'egg' | 'baby' | 'adult'
 * @param adultForm - The adult form ID (e.g., 'bloomi', 'rocky'). Only used when stage === 'adult'.
 */
export function getBlobbiBodyBottomInset(stage: string, adultForm?: string): number {
  switch (stage) {
    case 'egg':
      return EGG_BODY_BOTTOM_INSET;
    case 'baby':
      return BABY_BODY_BOTTOM_INSET;
    case 'adult':
      return ADULT_BODY_BOTTOM_INSET[adultForm ?? ''] ?? DEFAULT_ADULT_INSET;
    default:
      return BABY_BODY_BOTTOM_INSET;
  }
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

// Re-export from dedicated file to maintain backward compatibility
export { DEFAULT_ROOM_LAYOUTS } from './room-layout-defaults';

// ─── Presets ──────────────────────────────────────────────────────────────────

/** A named preset for a surface (wall or floor) */
export interface SurfacePreset {
  id: string;
  label: string;
  surface: RoomSurfaceLayout;
}

export const WALL_PRESETS: SurfacePreset[] = [
  { id: 'warm-solid', label: 'Warm', surface: { style: 'solid', palette: ['#fef3c7', '#fde68a'] } },
  { id: 'warm-gradient', label: 'Sunset', surface: { style: 'gradient', palette: ['#fef3c7', '#fde68a'] } },
  { id: 'cool-solid', label: 'Sky', surface: { style: 'solid', palette: ['#e0f2fe', '#bae6fd'] } },
  { id: 'cool-gradient', label: 'Ocean', surface: { style: 'gradient', palette: ['#e0f2fe', '#7dd3fc'] } },
  { id: 'green-solid', label: 'Meadow', surface: { style: 'solid', palette: ['#ecfccb', '#d9f99d'] } },
  { id: 'purple-gradient', label: 'Dusk', surface: { style: 'gradient', palette: ['#ede9fe', '#c4b5fd'] } },
  { id: 'pink-solid', label: 'Blush', surface: { style: 'solid', palette: ['#fce7f3', '#fbcfe8'] } },
  { id: 'neutral-solid', label: 'Cloud', surface: { style: 'solid', palette: ['#f8fafc', '#e2e8f0'] } },
  { id: 'warm-stripes', label: 'Candy', surface: { style: 'stripes', palette: ['#fef3c7', '#fbbf24'], variant: 'soft' } },
  { id: 'cool-dots', label: 'Bubbles', surface: { style: 'dots', palette: ['#e0f2fe', '#38bdf8'] } },
];

export const FLOOR_PRESETS: SurfacePreset[] = [
  { id: 'wood-wide', label: 'Oak', surface: { style: 'wood', palette: ['#d97706', '#92400e'], variant: 'wide' } },
  { id: 'wood-narrow', label: 'Walnut', surface: { style: 'wood', palette: ['#78350f', '#451a03'], variant: 'narrow' } },
  { id: 'wood-light', label: 'Birch', surface: { style: 'wood', palette: ['#fbbf24', '#d97706'], variant: 'medium' } },
  { id: 'tile-light', label: 'Marble', surface: { style: 'tile', palette: ['#f5f5f4', '#e7e5e4'] } },
  { id: 'tile-blue', label: 'Ceramic', surface: { style: 'tile', palette: ['#f0f9ff', '#dbeafe'] } },
  { id: 'tile-warm', label: 'Terra', surface: { style: 'tile', palette: ['#fef3c7', '#fde68a'] } },
  { id: 'carpet-purple', label: 'Royal', surface: { style: 'carpet', palette: ['#7c3aed', '#6d28d9'], variant: 'soft' } },
  { id: 'carpet-green', label: 'Moss', surface: { style: 'carpet', palette: ['#166534', '#14532d'], variant: 'soft' } },
  { id: 'carpet-pink', label: 'Rose', surface: { style: 'carpet', palette: ['#ec4899', '#be185d'], variant: 'soft' } },
  { id: 'solid-dark', label: 'Slate', surface: { style: 'solid', palette: ['#334155', '#1e293b'] } },
];

// ─── Validation Helpers ───────────────────────────────────────────────────────

/** Strict hex color regex: #RGB, #RRGGBB, or #RRGGBBAA */
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value);
}

function isValidWallStyle(value: unknown): value is WallStyle {
  return typeof value === 'string' && (WALL_STYLES as readonly string[]).includes(value);
}

function isValidFloorStyle(value: unknown): value is FloorStyle {
  return typeof value === 'string' && (FLOOR_STYLES as readonly string[]).includes(value);
}

function isValidVariant(value: unknown): value is SurfaceVariant {
  return typeof value === 'string' && (SURFACE_VARIANTS as readonly string[]).includes(value);
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse room layouts from profile content string.
 * Returns undefined if content is missing, malformed, or has no valid `room_layouts`.
 * Never throws.
 */
export function parseRoomLayoutsContent(
  profileContent: string | undefined | null,
): RoomLayoutsContent | undefined {
  if (!profileContent || !profileContent.trim()) return undefined;

  try {
    const raw = JSON.parse(profileContent);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;

    const layouts = raw.room_layouts;
    if (typeof layouts !== 'object' || layouts === null || Array.isArray(layouts)) return undefined;

    // Version check — only v1 supported
    if (layouts.v !== 1) return undefined;

    const byRoom = layouts.by_room;
    if (typeof byRoom !== 'object' || byRoom === null || Array.isArray(byRoom)) return undefined;

    const parsed: RoomLayoutsContent = { v: 1, by_room: {} };

    for (const key of Object.keys(byRoom)) {
      if (!isValidRoomId(key)) continue;
      const roomLayout = parseRoomLayout(byRoom[key]);
      if (roomLayout) {
        parsed.by_room[key] = roomLayout;
      }
    }

    // Return even if empty (user may have reset all rooms)
    return parsed;
  } catch {
    return undefined;
  }
}

function parseRoomLayout(raw: unknown): RoomLayout | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;

  const wall = parseSurface(obj.wall, 'wall');
  const floor = parseSurface(obj.floor, 'floor');
  if (!wall || !floor) return undefined;

  return { wall, floor };
}

function parseSurface(
  raw: unknown,
  type: 'wall' | 'floor',
): RoomSurfaceLayout | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;

  // Validate style
  const style = obj.style;
  if (type === 'wall' && !isValidWallStyle(style)) return undefined;
  if (type === 'floor' && !isValidFloorStyle(style)) return undefined;

  // Validate palette: must be an array of 1–4 hex colors
  if (!Array.isArray(obj.palette)) return undefined;
  const palette = obj.palette.filter(isValidHexColor);
  if (palette.length < 1 || palette.length > 4) return undefined;

  // Optional variant
  const variant = isValidVariant(obj.variant) ? obj.variant : undefined;

  // Optional angle: finite number, normalized to 0–359
  const rawAngle = obj.angle;
  const angle = typeof rawAngle === 'number' && Number.isFinite(rawAngle)
    ? ((Math.round(rawAngle) % 360) + 360) % 360
    : undefined;

  return { style: style as WallStyle | FloorStyle, palette, variant, angle };
}

// ─── Effective Layout Helper ──────────────────────────────────────────────────

// Re-export from dedicated file to maintain backward compatibility
export { getEffectiveRoomLayout } from './room-layout-effective';

/**
 * Find which preset ID matches a given surface layout, or undefined if custom/none.
 */
export function findMatchingPresetId(
  surface: RoomSurfaceLayout,
  presets: SurfacePreset[],
): string | undefined {
  return presets.find(p =>
    p.surface.style === surface.style &&
    p.surface.palette.length === surface.palette.length &&
    p.surface.palette.every((c, i) => c === surface.palette[i]) &&
    (p.surface.variant ?? undefined) === (surface.variant ?? undefined)
  )?.id;
}
