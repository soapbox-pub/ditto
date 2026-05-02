/**
 * Color Guardrails for Blobbi Visual Traits
 *
 * Pure validation/adjustment utilities that ensure generated colors produce
 * good visual results in the Blobbi rendering pipeline. Operates in HSL
 * color space for perceptually-aware adjustments.
 *
 * These guardrails are designed to be applied at the generation layer only.
 * They do NOT affect existing explicit color tags on Nostr events -- those
 * are always passed through unchanged per the tag-priority rule in
 * deriveVisualTraits().
 *
 * Why HSL?
 * The SVG rendering pipeline (baby-svg-customizer, adult-svg-customizer)
 * uses lightenColor(base, 40) for gradient highlights and darkenColor(base, 15)
 * for shadows. These are naive RGB channel operations that clip at 0/255.
 * Colors at extreme lightness values cause clipping, producing flat or
 * invisible gradients. HSL lightness lets us reason about this directly
 * and keep generated colors in the range where the RGB pipeline works well.
 */

// ─── Thresholds ───────────────────────────────────────────────────────────────
//
// Calibrated against the existing 10-color palette (all base colors fall in
// L=50..76, S=48..96) and the rendering pipeline's lighten/darken amounts.
// These thresholds are intentionally wider than the palette range to allow
// creative variety in arbitrary generation while preventing degenerate output.

/** Minimum lightness for base colors. Below this, darkenColor(base, 15) clips to black. */
export const BASE_LIGHTNESS_MIN = 25;

/** Maximum lightness for base colors. Above this, lightenColor(base, 40) clips to white. */
export const BASE_LIGHTNESS_MAX = 80;

/** Minimum saturation for base colors. Below this, colors appear as dull grays. */
export const BASE_SATURATION_MIN = 20;

/**
 * Minimum lightness difference between base and secondary when their hues
 * are similar (< HUE_DISTINCTION_THRESHOLD degrees apart). Without enough
 * lightness separation, the 3D body gradient collapses into a flat fill.
 *
 * The existing palette's tightest matched pair is Indigo (L=74) / Lt Indigo
 * (L=82) at delta=8, which is borderline. We use 12 as the floor for
 * arbitrary generation to guarantee visible shading.
 */
export const MIN_BASE_SECONDARY_LIGHTNESS_DELTA = 12;

/**
 * Hue difference (degrees) above which base and secondary are considered
 * visually distinct regardless of lightness. Two colors 30+ degrees apart
 * on the hue wheel produce clearly different tones even at similar lightness.
 */
export const HUE_DISTINCTION_THRESHOLD = 30;

/**
 * Maximum lightness for eye colors. Above this, pupils become invisible
 * against the white sclera in both baby and adult SVGs.
 */
export const EYE_LIGHTNESS_MAX = 75;

/**
 * Minimum lightness difference between eye color and base color. Ensures
 * pupils remain visually prominent against the body. The rendering pipeline
 * draws pupils inside white sclera circles, so hue difference carries some
 * weight -- but for conservative safety we enforce a lightness floor too.
 */
export const MIN_EYE_BASE_LIGHTNESS_DELTA = 20;

// ─── HSL ↔ Hex Conversion ────────────────────────────────────────────────────

/**
 * Expand 3-char hex (#RGB) to 6-char hex (#RRGGBB).
 * 6-char values pass through unchanged.
 */
function expandHex(hex: string): string {
  if (hex.length === 4) {
    const r = hex[1], g = hex[2], b = hex[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return hex;
}

/**
 * Convert a hex color (#RGB or #RRGGBB) to HSL.
 * Returns h: 0-360, s: 0-100, l: 0-100.
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const hex6 = expandHex(hex);
  const num = parseInt(hex6.slice(1), 16);
  const r = ((num >> 16) & 0xff) / 255;
  const g = ((num >> 8) & 0xff) / 255;
  const b = (num & 0xff) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: Math.round(l * 100) };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
      break;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Convert HSL values to a hex color string (#RRGGBB, uppercase).
 * Expects h: 0-360, s: 0-100, l: 0-100.
 *
 * Uses the CSS Color Level 4 conversion formula.
 */
export function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);

  function f(n: number): number {
    const k = (n + h / 30) % 12;
    return lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  }

  const R = Math.round(f(0) * 255);
  const G = Math.round(f(8) * 255);
  const B = Math.round(f(4) * 255);

  return '#' + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1).toUpperCase();
}

// ─── Hue Distance ─────────────────────────────────────────────────────────────

/**
 * Compute the shortest angular distance between two hue values (0-180).
 * Accounts for the circular nature of the hue wheel.
 */
export function hueDelta(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2);
  return Math.min(d, 360 - d);
}

// ─── Guardrail Functions ──────────────────────────────────────────────────────

/**
 * Clamp a base color to a usable lightness and saturation range.
 *
 * The SVG pipeline gradient builders use:
 * - lightenColor(base, 40)  → adds ~102 to each RGB channel for highlights
 * - darkenColor(base, 15)   → subtracts ~38 from each channel for shadows
 *
 * Colors outside L=[25, 80] cause these operations to clip, flattening
 * the 3D gradient into a near-solid fill. Colors with S < 20 appear as
 * indistinguishable grays regardless of hue.
 *
 * Returns the original color if already within range, or an adjusted copy.
 */
export function clampBaseColor(hex: string): string {
  const hsl = hexToHsl(hex);
  let changed = false;

  if (hsl.l < BASE_LIGHTNESS_MIN) {
    hsl.l = BASE_LIGHTNESS_MIN;
    changed = true;
  } else if (hsl.l > BASE_LIGHTNESS_MAX) {
    hsl.l = BASE_LIGHTNESS_MAX;
    changed = true;
  }

  if (hsl.s < BASE_SATURATION_MIN && hsl.s > 0) {
    // Only enforce saturation floor for chromatic colors.
    // True achromatic (s=0) is left alone -- a caller explicitly
    // generating gray is making a deliberate choice.
    hsl.s = BASE_SATURATION_MIN;
    changed = true;
  }

  return changed ? hslToHex(hsl.h, hsl.s, hsl.l) : hex;
}

/**
 * Ensure secondary color is perceptually distinct from base color.
 *
 * The secondary color provides the inner gradient stops in the 3D body
 * gradient. If it's too close to the base, the gradient collapses into
 * a flat fill and the Blobbi loses its characteristic rounded shading.
 *
 * Distinction is measured by a combination of hue and lightness distance:
 * - Hue difference >= 30° → colors are visually distinct (passes as-is)
 * - Hue difference < 30°  → lightness must differ by >= 12 points
 *
 * When adjustment is needed, the secondary is shifted lighter if the base
 * is dark/mid, or darker if the base is light, preserving its hue.
 *
 * Returns the original secondary if already distinct, or an adjusted copy.
 */
export function ensureDistinctSecondary(baseHex: string, secondaryHex: string): string {
  const baseHsl = hexToHsl(baseHex);
  const secHsl = hexToHsl(secondaryHex);

  // Different hues are already visually distinct
  if (hueDelta(baseHsl.h, secHsl.h) >= HUE_DISTINCTION_THRESHOLD) {
    return secondaryHex;
  }

  // Similar hue: check lightness separation
  if (Math.abs(baseHsl.l - secHsl.l) >= MIN_BASE_SECONDARY_LIGHTNESS_DELTA) {
    return secondaryHex;
  }

  // Shift secondary away from base in lightness, preserving hue/saturation.
  // Prefer making secondary lighter (matching the existing palette convention
  // where secondaries are lighter variants of bases).
  let targetL: number;
  const lighterTarget = baseHsl.l + MIN_BASE_SECONDARY_LIGHTNESS_DELTA;
  const darkerTarget = baseHsl.l - MIN_BASE_SECONDARY_LIGHTNESS_DELTA;

  if (lighterTarget <= 90) {
    targetL = lighterTarget;
  } else if (darkerTarget >= 10) {
    targetL = darkerTarget;
  } else {
    // Base is in a very constrained range -- go as light as possible
    targetL = 90;
  }

  return hslToHex(secHsl.h, secHsl.s, targetL);
}

/**
 * Ensure eye color has sufficient visibility.
 *
 * Eye color must satisfy two constraints:
 * 1. Not too light (L <= 75) -- pupils sit inside white sclera circles
 *    in both baby and adult SVGs, so very light colors disappear.
 * 2. Enough lightness distance from base color (delta >= 20) -- even
 *    though pupils render against white sclera, the overall visual
 *    impression suffers when eye and body colors are too similar.
 *
 * When adjustment is needed, eyes are preferentially darkened (darker
 * pupils are more natural). Eyes are only lightened when the base color
 * is very dark and darkening further would push below L=5.
 *
 * Returns the original eye color if already visible, or an adjusted copy.
 */
export function ensureEyeVisibility(eyeHex: string, baseHex: string): string {
  const eyeHsl = hexToHsl(eyeHex);
  const baseHsl = hexToHsl(baseHex);
  let l = eyeHsl.l;
  let changed = false;

  // Constraint 1: cap lightness so pupils are visible on white sclera
  if (l > EYE_LIGHTNESS_MAX) {
    l = EYE_LIGHTNESS_MAX;
    changed = true;
  }

  // Constraint 2: ensure enough distance from base color lightness
  if (Math.abs(l - baseHsl.l) < MIN_EYE_BASE_LIGHTNESS_DELTA) {
    // Prefer darkening (more natural for pupils)
    const darkerTarget = baseHsl.l - MIN_EYE_BASE_LIGHTNESS_DELTA;
    const lighterTarget = baseHsl.l + MIN_EYE_BASE_LIGHTNESS_DELTA;

    if (darkerTarget >= 5) {
      l = darkerTarget;
    } else if (lighterTarget <= EYE_LIGHTNESS_MAX) {
      l = lighterTarget;
    } else {
      // Very constrained -- go as dark as possible
      l = 5;
    }
    changed = true;
  }

  return changed ? hslToHex(eyeHsl.h, eyeHsl.s, l) : eyeHex;
}

// ─── Combined Entry Point ─────────────────────────────────────────────────────

/**
 * Apply all color guardrails to a set of generated Blobbi colors.
 *
 * Guardrails are applied in dependency order:
 * 1. Clamp base color to usable luminance/saturation range
 * 2. Ensure secondary is distinct from the (clamped) base
 * 3. Ensure eye color is visible against the (clamped) base
 *
 * Colors that are already within safe ranges pass through unchanged.
 *
 * IMPORTANT: This function is for newly-generated colors only. It must NOT
 * be applied to explicit color tags from existing Nostr events -- those are
 * preserved unchanged per the tag-priority rule in deriveVisualTraits().
 */
export function applyColorGuardrails(colors: {
  baseColor: string;
  secondaryColor: string;
  eyeColor: string;
}): {
  baseColor: string;
  secondaryColor: string;
  eyeColor: string;
} {
  const baseColor = clampBaseColor(colors.baseColor);
  const secondaryColor = ensureDistinctSecondary(baseColor, colors.secondaryColor);
  const eyeColor = ensureEyeVisibility(colors.eyeColor, baseColor);

  return { baseColor, secondaryColor, eyeColor };
}
