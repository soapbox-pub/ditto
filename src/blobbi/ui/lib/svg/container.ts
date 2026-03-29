/**
 * SVG Container Utilities for Blobbi
 *
 * Handles SVG viewport and sizing adjustments.
 *
 * Used by:
 * - Baby SVG customizer
 * - Adult SVG customizer
 */

/**
 * Ensure SVG has width/height attributes so it fills its container.
 *
 * This is needed because SVGs with only viewBox may not fill flex containers properly.
 * Adds width="100%" height="100%" to the SVG tag if not already present.
 *
 * @param svgText - The SVG content to process
 * @returns SVG content with width/height attributes
 */
export function ensureSvgFillsContainer(svgText: string): string {
  // Check if width and height are already set
  if (/\swidth=/.test(svgText) && /\sheight=/.test(svgText)) {
    return svgText;
  }

  // Add width="100%" height="100%" to the SVG tag
  return svgText.replace(/<svg([^>]*)>/, '<svg$1 width="100%" height="100%">');
}
