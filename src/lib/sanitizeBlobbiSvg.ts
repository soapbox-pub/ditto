/**
 * Blobbi SVG sanitization — defense-in-depth for the Blobbi rendering pipeline.
 *
 * The Blobbi visual pipeline (customizers, eye-animation, emotions) performs
 * extensive string manipulation on SVG markup before injecting it via
 * `dangerouslySetInnerHTML`. While user inputs are validated at the parsing
 * boundary (normalizeHexColor, instanceId sanitization), this sanitizer acts
 * as a safety net at the *output* boundary — catching anything unexpected
 * that the upstream pipeline might produce.
 *
 * This config is intentionally broader than `sanitizeSvg()` (used for
 * untrusted user-drawn stickers) because Blobbi SVGs legitimately use
 * gradients, clip paths, CSS animations, and data attributes. The two
 * configs exist for different threat models and should not be merged.
 *
 * Blocked: <script>, <foreignObject>, <iframe>, <embed>, <object>, <a>,
 *          <use>, <image>, all event handlers (on*), href/xlink:href.
 */

import DOMPurify from 'dompurify';

/**
 * SVG elements used by the Blobbi rendering pipeline:
 * - Structural: svg, g, defs, path, circle, ellipse, rect, line, polyline, polygon
 * - Gradients: radialGradient, linearGradient, stop
 * - Clipping: clipPath
 * - Animation: animate, animateTransform
 * - Text: text (used in fallback SVGs)
 * - Style: style (used for @keyframes in emotion system)
 */
const ALLOWED_TAGS = [
  // Structural
  'svg',
  'g',
  'defs',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  // Gradients
  'radialGradient',
  'linearGradient',
  'stop',
  // Clipping
  'clipPath',
  // Animation
  'animate',
  'animateTransform',
  // Text (fallback SVGs)
  'text',
  // Style (emotion @keyframes)
  'style',
];

/**
 * Attributes used across the Blobbi SVG pipeline.
 *
 * Notably absent: href, xlink:href (Blobbi gradients use url(#id) references
 * instead), and all event handlers (on*).
 */
const ALLOWED_ATTRS = [
  // Structural
  'xmlns',
  'viewBox',
  'width',
  'height',
  'id',
  'class',
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
  'fill-rule',
  'opacity',
  'transform',
  'style',
  'clip-path',
  'clip-rule',
  // Geometry
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
  'd',
  'points',
  // Gradient / stop attributes
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'fx',
  'fy',
  // Animation attributes
  'attributeName',
  'values',
  'keyTimes',
  'dur',
  'begin',
  'end',
  'repeatCount',
  'from',
  'to',
  'type',
  // Text
  'text-anchor',
  'dominant-baseline',
  'font-family',
  'font-size',
  'font-weight',
];

/** Maximum SVG string length (512 KB). Blobbi SVGs with all emotion overlays are ~30 KB. */
const MAX_SVG_LENGTH = 512 * 1024;

/**
 * Sanitize a Blobbi SVG string before injection via `dangerouslySetInnerHTML`.
 *
 * This is the output-boundary safety net for the Blobbi rendering pipeline.
 * It strips scripts, event handlers, and other dangerous constructs while
 * preserving the gradients, animations, and clip paths that the pipeline
 * legitimately produces.
 *
 * DOMPurify also handles data-* attributes by default (allowed unless
 * explicitly forbidden), which the eye animation system relies on for
 * data-cx, data-cy, data-eye-top, data-eye-bottom, data-clip-height,
 * data-clip-id.
 */
export function sanitizeBlobbiSvg(dirty: string): string {
  if (dirty.length > MAX_SVG_LENGTH) {
    if (import.meta.env.DEV) {
      console.warn('[sanitizeBlobbiSvg] SVG exceeds max length, rejecting');
    }
    return '';
  }

  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { svg: true, svgFilters: false },
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRS,
    FORBID_TAGS: [
      'script',
      'foreignObject',
      'iframe',
      'embed',
      'object',
      'use',
      'image',
      'a',
    ],
    FORBID_ATTR: [
      // Event handlers
      'onload',
      'onerror',
      'onclick',
      'onmouseover',
      'onmouseout',
      'onmouseenter',
      'onmouseleave',
      'onfocus',
      'onblur',
      'onanimationend',
      'onanimationstart',
      // Link targets — Blobbi SVGs use url(#id) for gradient refs, not href
      'href',
      'xlink:href',
    ],
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  }) as string;
}
