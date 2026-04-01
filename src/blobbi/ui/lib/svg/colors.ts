/**
 * Color Utilities for Blobbi SVG Manipulation
 *
 * Shared color manipulation functions used across:
 * - Baby SVG customizer
 * - Adult SVG customizer
 * - Eye animation (eyelid generation)
 * - Emotion overlays
 */

/**
 * Lighten a hex color by a percentage.
 *
 * @param color - Hex color string (e.g., "#ff0000")
 * @param percent - Percentage to lighten (0-100)
 * @returns Lightened hex color string
 */
export function lightenColor(color: string, percent: number): string {
  if (!color.startsWith('#')) return color;

  const num = parseInt(color.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;

  return (
    '#' +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
      .toUpperCase()
  );
}

/**
 * Darken a hex color by a percentage.
 *
 * @param color - Hex color string (e.g., "#ff0000")
 * @param percent - Percentage to darken (0-100)
 * @returns Darkened hex color string
 */
export function darkenColor(color: string, percent: number): string {
  if (!color.startsWith('#')) return color;

  const num = parseInt(color.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, (num >> 16) - amt);
  const G = Math.max(0, ((num >> 8) & 0x00ff) - amt);
  const B = Math.max(0, (num & 0x0000ff) - amt);

  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1).toUpperCase();
}
