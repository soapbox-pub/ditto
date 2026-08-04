// ── Widget accent colour derivation ──────────────────────────────────────────
//
// Each widget gets a deterministic hue derived from its id, giving every widget
// a stable, perceptually-distinct accent tint for its border and handle bar.
//
// The S/L values are fixed per colour-scheme mode (light/dark) and tuned so a
// border + subtle handle-bar tint meets WCAG 2.1 3:1 minimum contrast against
// the background in both modes.

import { contrastForeground, formatHsl } from '@/lib/colorUtils';

// ─── Per-mode saturation/lightness constants ───────────────────────────

/** Saturation for the widget accent in dark mode (percent, 0-100). */
const DARK_ACCENT_SATURATION = 55;
/** Lightness for the widget accent in dark mode (percent, 0-100). */
const DARK_ACCENT_LIGHTNESS = 55;

/** Saturation for the widget accent in light mode (percent, 0-100). */
const LIGHT_ACCENT_SATURATION = 70;
/** Lightness for the widget accent in light mode (percent, 0-100). */
const LIGHT_ACCENT_LIGHTNESS = 45;

/** Saturation for the widget surface fill in dark mode (percent, 0-100). */
const DARK_SURFACE_SATURATION = 45;
/** Lightness for the widget surface fill in dark mode (percent, 0-100). */
const DARK_SURFACE_LIGHTNESS = 32;

/** Saturation for the widget surface fill in light mode (percent, 0-100). */
const LIGHT_SURFACE_SATURATION = 55;
/** Lightness for the widget surface fill in light mode (percent, 0-100). */
const LIGHT_SURFACE_LIGHTNESS = 42;

const DJB2_SEED = 5381;
const UINT32_MASK = 0xffffffff;

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Deterministic 32-bit djb2 hash of a string.
 * Same input always produces the same output.
 */
export function hashWidgetId(id: string): number {
  let hash = DJB2_SEED;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) + hash + id.charCodeAt(i)) & UINT32_MASK;
  }
  // Force unsigned 32-bit range so callers don't get negative numbers.
  return hash >>> 0;
}

/**
 * Deterministic hue (0–359) derived from a widget id.
 * Same id → same hue every call.
 */
export function widgetAccentHue(id: string): number {
  return hashWidgetId(id) % 360;
}

/**
 * Returns a CSS-variable-style record that sets `--widget-accent` to a
 * bare HSL triple string (e.g. `"120 45% 45%"`) whose hue is derived from
 * the widget id and whose S/L are picked for the given colour-scheme mode.
 *
 * Intended to be spread as an inline style on the widget frame root, matching
 * the existing ScopedTheme precedent.
 */
export function widgetAccentVars(
  id: string,
  mode: 'dark' | 'light',
): Record<string, string> {
  const hue = widgetAccentHue(id);
  const saturation = mode === 'dark' ? DARK_ACCENT_SATURATION : LIGHT_ACCENT_SATURATION;
  const lightness = mode === 'dark' ? DARK_ACCENT_LIGHTNESS : LIGHT_ACCENT_LIGHTNESS;
  const accent = formatHsl(hue, saturation, lightness);
  const surfaceSaturation = mode === 'dark' ? DARK_SURFACE_SATURATION : LIGHT_SURFACE_SATURATION;
  const surfaceLightness = mode === 'dark' ? DARK_SURFACE_LIGHTNESS : LIGHT_SURFACE_LIGHTNESS;
  const surface = formatHsl(hue, surfaceSaturation, surfaceLightness);

  return {
    '--widget-accent': accent,
    '--widget-accent-foreground': contrastForeground(accent),
    '--widget-accent-surface': surface,
    '--widget-accent-surface-foreground': contrastForeground(surface),
  };
}
