// src/blobbi/rooms/scene/resolver.ts

/**
 * Room Scene Resolver — Applies optional theme-based colors to a scene.
 *
 * The resolver takes a declarative RoomScene and the current theme's
 * core colors, and produces a ResolvedRoomScene with final concrete colors.
 *
 * ── Theme as Palette Input ────────────────────────────────────────────────
 *
 * The theme does NOT replace the room scene. It only influences the
 * color palette when `scene.useThemeColors` is true:
 *
 *   - Wall/floor *types* always come from the scene declaration
 *   - Only the *colors* are derived from the theme
 *   - If theme colors are unavailable, falls back to scene-local colors
 *
 * Color derivation strategy:
 *   - Wall color: derived from the theme's background color (warmed slightly)
 *   - Floor color: derived from the theme's primary color (earthy/muted version)
 *   - Floor accent: a darker shade of the floor color
 */

import type { CoreThemeColors } from '@/themes';
import type { AppConfig, Theme } from '@/contexts/AppContext';
import { builtinThemes, resolveTheme, resolveThemeConfig } from '@/themes';
import {
  parseHsl,
  hslToRgb,
  rgbToHex,
  darkenHex,
  formatHsl,
} from '@/lib/colorUtils';
import type { RoomScene, ResolvedRoomScene } from './types';

// ─── Theme Color Extraction ───────────────────────────────────────────────────

/**
 * Get the currently active CoreThemeColors from the app config.
 *
 * Resolves through the full theme chain:
 *   system → light/dark OS preference
 *   custom → user's custom theme colors
 *   light/dark → builtin or configured theme colors
 */
export function getActiveThemeColors(config: AppConfig): CoreThemeColors {
  const resolved: 'light' | 'dark' | 'custom' = resolveTheme(config.theme as Theme);

  if (resolved === 'custom') {
    return config.customTheme?.colors ?? builtinThemes.dark;
  }

  return resolveThemeConfig(resolved, config.themes).colors;
}

// ─── HSL-to-Hex Helper ───────────────────────────────────────────────────────

/** Convert an HSL string (e.g. "228 20% 10%") to a hex color. */
function hslStringToHex(hsl: string): string {
  const { h, s, l } = parseHsl(hsl);
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

// ─── Color Derivation from Theme ──────────────────────────────────────────────

/**
 * Derive a wall color from the theme's background.
 *
 * Strategy: take the background hue, warm it slightly (shift toward yellow),
 * increase saturation gently, and push lightness toward a wall-appropriate
 * range (60-85% lightness for walls).
 */
function deriveWallColor(themeColors: CoreThemeColors): string {
  const bg = parseHsl(themeColors.background);

  // Warm the hue: shift slightly toward 30 (warm/golden)
  const warmHue = bg.h + (30 - bg.h) * 0.15;
  // Gentle saturation: enough to feel warm, not garish
  const wallSat = Math.min(35, Math.max(10, bg.s * 0.6 + 8));
  // Lightness: walls should be light-ish regardless of dark/light theme
  const wallLit = Math.min(88, Math.max(65, bg.l * 0.3 + 60));

  const [r, g, b] = hslToRgb(warmHue, wallSat, wallLit);
  return rgbToHex(r, g, b);
}

/**
 * Derive a floor color from the theme's primary color.
 *
 * Strategy: take the primary hue, shift it toward an earthy/warm tone,
 * significantly desaturate it, and bring lightness to a floor-appropriate
 * range (35-55% — darker than walls for visual grounding).
 */
function deriveFloorColor(themeColors: CoreThemeColors): string {
  const primary = parseHsl(themeColors.primary);

  // Shift hue toward warm/brown (30°), more aggressively than wall
  const earthyHue = primary.h + (30 - primary.h) * 0.35;
  // Desaturate significantly for an earthy/natural feel
  const floorSat = Math.min(40, Math.max(15, primary.s * 0.35 + 10));
  // Lightness: middle range, grounding the room
  const floorLit = Math.min(55, Math.max(38, primary.l * 0.4 + 25));

  const hsl = formatHsl(earthyHue, floorSat, floorLit);
  return hslStringToHex(hsl);
}

/**
 * Derive a floor accent color (darker shade of the floor color).
 */
function deriveFloorAccent(floorHex: string): string {
  return darkenHex(floorHex, 0.2);
}

// ─── Scene Resolver ───────────────────────────────────────────────────────────

/**
 * Resolve a room scene into final concrete colors.
 *
 * When `scene.useThemeColors` is true AND themeColors are provided,
 * the wall and floor colors are derived from the theme palette.
 * Wall/floor types are always preserved from the scene declaration.
 *
 * Falls back to scene-local colors when:
 *   - `scene.useThemeColors` is false
 *   - `themeColors` is undefined/null
 *   - Color derivation produces invalid values (defensive)
 */
export function resolveRoomScene(
  scene: RoomScene,
  themeColors?: CoreThemeColors,
): ResolvedRoomScene {
  // If theme colors not requested or not available, use scene-local colors
  if (!scene.useThemeColors || !themeColors) {
    return {
      wall: { ...scene.wall },
      floor: { ...scene.floor },
    };
  }

  // Derive colors from theme
  const wallColor = deriveWallColor(themeColors);
  const floorColor = deriveFloorColor(themeColors);
  const floorAccent = deriveFloorAccent(floorColor);

  return {
    wall: {
      ...scene.wall,
      color: wallColor,
      // Accent color is also theme-derived when applicable
      ...(scene.wall.accentColor ? { accentColor: darkenHex(wallColor, 0.1) } : {}),
    },
    floor: {
      ...scene.floor,
      color: floorColor,
      accentColor: floorAccent,
    },
  };
}
