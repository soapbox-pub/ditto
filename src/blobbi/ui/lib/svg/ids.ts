/**
 * SVG ID Utilities for Blobbi
 *
 * Handles uniquification of SVG IDs to prevent collisions when
 * multiple Blobbis are rendered on the same page.
 *
 * Used by:
 * - Baby SVG customizer
 * - Adult SVG customizer
 */

/**
 * Make all SVG definition IDs unique by prefixing with an instance ID.
 * This prevents gradient ID collisions when multiple Blobbis are rendered on the same page.
 *
 * Updates both:
 * - Definition IDs: id="gradientName" → id="prefix_gradientName"
 * - References: url(#gradientName) → url(#prefix_gradientName)
 * - xlink:href and href references
 *
 * @param svgText - The SVG content to process
 * @param instanceId - Unique identifier for this Blobbi instance
 * @returns SVG content with uniquified IDs
 */
export function uniquifySvgIds(svgText: string, instanceId: string): string {
  // Generate a unique prefix from the full instance ID
  // Sanitize to only allow valid SVG ID characters (letters, numbers, underscore, hyphen)
  // Note: instanceId format is "blobbi-{pubkeyPrefix12}-{petId10}" so we need the full ID
  // to distinguish between Blobbis owned by the same user
  const prefix = `b_${instanceId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  // Find all IDs defined in the SVG (in defs, gradients, clipPaths, etc.)
  const idPattern = /\bid=["']([^"']+)["']/g;
  const ids = new Set<string>();
  let match;

  while ((match = idPattern.exec(svgText)) !== null) {
    ids.add(match[1]);
  }

  // Replace each ID and its references
  let modified = svgText;
  for (const id of ids) {
    const prefixedId = `${prefix}_${id}`;

    // Replace the ID definition
    modified = modified.replace(new RegExp(`\\bid=["']${escapeRegExp(id)}["']`, 'g'), `id="${prefixedId}"`);

    // Replace url() references
    modified = modified.replace(new RegExp(`url\\(#${escapeRegExp(id)}\\)`, 'g'), `url(#${prefixedId})`);

    // Replace xlink:href references (older SVG format)
    modified = modified.replace(
      new RegExp(`xlink:href=["']#${escapeRegExp(id)}["']`, 'g'),
      `xlink:href="#${prefixedId}"`
    );

    // Replace href references (newer SVG format)
    modified = modified.replace(new RegExp(`\\bhref=["']#${escapeRegExp(id)}["']`, 'g'), `href="#${prefixedId}"`);
  }

  return modified;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
