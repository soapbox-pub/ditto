/**
 * SVG sanitization — prevents XSS from untrusted SVG markup.
 *
 * The drawing canvas (svgDrawing.ts) produces SVGs containing only <svg> and
 * <path> elements with a small set of presentation attributes.  A malicious
 * sender could craft a letter whose sticker `svg` field contains arbitrary
 * HTML/JS (e.g. `<svg onload="…">`, `<foreignObject>`, `<script>`).
 *
 * This module uses DOMPurify configured for SVG-only output with an additional
 * strict allowlist of elements and attributes that matches what the drawing
 * canvas actually generates.
 */

import DOMPurify from 'dompurify';

/**
 * Elements the drawing canvas can produce, plus structural SVG elements
 * that are safe and useful for rendering simple vector graphics.
 */
const ALLOWED_TAGS = [
  'svg',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'g',
];

/**
 * Attributes the drawing canvas uses, plus standard safe SVG presentation
 * attributes. No event handlers, no `href`/`xlink:href`, no `style`.
 */
const ALLOWED_ATTRS = [
  // Structural
  'xmlns',
  'viewBox',
  'width',
  'height',
  // Path data
  'd',
  // Presentation
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'fill-opacity',
  'opacity',
  'transform',
  // Geometry attributes for basic shapes
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
];

/** Maximum SVG string length (256 KB). Anything larger is likely malicious or degenerate. */
const MAX_SVG_LENGTH = 256 * 1024;

/**
 * Sanitize an SVG string so it is safe to inject via `dangerouslySetInnerHTML`.
 *
 * Returns a clean SVG string with only allowlisted elements and attributes.
 * Any scripts, event handlers, foreignObject, use/image elements, data URIs,
 * and other dangerous constructs are stripped.
 *
 * SVGs exceeding MAX_SVG_LENGTH are rejected outright to prevent denial-of-service
 * via oversized payloads that would force DOMPurify to parse megabytes of markup.
 */
export function sanitizeSvg(dirty: string): string {
  if (dirty.length > MAX_SVG_LENGTH) return '';
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { svg: true, svgFilters: false },
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRS,
    // Strip <use>, <image>, <foreignObject>, <script>, <style>, etc.
    FORBID_TAGS: ['script', 'style', 'foreignObject', 'use', 'image', 'a', 'iframe', 'embed', 'object'],
    // Strip all event handler attributes (on*)
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur', 'style', 'href', 'xlink:href'],
    // Return string, not DOM node
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}
