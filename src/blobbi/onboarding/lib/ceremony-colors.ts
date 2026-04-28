/**
 * Shared color utilities for ceremony backgrounds.
 *
 * Used by both BlobbiHatchingCeremony and BlobbiEvolveCeremony to derive
 * a soft pastel background from the blobbi's base color.
 */

/** Parse a CSS hex color (#RRGGBB) to its RGB components. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

/** Blend a single channel toward white (255) by `amount` (0–1). */
export function blendToWhite(channel: number, amount: number): number {
  return Math.round(channel + (255 - channel) * amount);
}

/**
 * Build a radial-gradient string from a hex color, blended toward white
 * at increasing intensities for a soft pastel reveal background.
 */
export function buildRevealGradient(hexColor: string): string {
  const { r, g, b } = hexToRgb(hexColor);

  const stop = (amount: number) =>
    `rgb(${blendToWhite(r, amount)},${blendToWhite(g, amount)},${blendToWhite(b, amount)})`;

  return `radial-gradient(ellipse at 50% 45%, ${stop(0.65)} 0%, ${stop(0.68)} 25%, ${stop(0.72)} 50%, ${stop(0.76)} 75%, ${stop(0.80)} 100%)`;
}
