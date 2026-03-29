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
 * gradients, clip paths, masks, CSS animations, SMIL animations, and data
 * attributes. The two configs exist for different threat models and should
 * not be merged.
 *
 * Blocked: <script>, <foreignObject>, <iframe>, <embed>, <object>, <a>,
 *          <use>, <image>, all event handlers (on*), href/xlink:href.
 */

import DOMPurify from 'dompurify';

/**
 * SVG elements used by the Blobbi rendering pipeline:
 * - Structural: svg, g, defs, path, circle, ellipse, rect, line, polyline, polygon
 * - Gradients: radialGradient, linearGradient, stop
 * - Clipping/Masking: clipPath, mask
 * - Animation: animate, animateTransform, animateMotion
 * - Text: text, tspan (used in Zzz sleepy animation)
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
  // Clipping and Masking
  'clipPath',
  'mask',
  // SMIL Animation (eye tracking, blinking, emotions, tears, sleepy mouth morphing)
  'animate',
  'animateTransform',
  'animateMotion',
  // Text (fallback SVGs, Zzz sleepy animation)
  'text',
  'tspan',
  // Style (emotion @keyframes for dizzy spirals, star eyes, sleepy, animated brows)
  'style',
];

/**
 * Attributes used across the Blobbi SVG pipeline.
 *
 * Notably absent: href, xlink:href (Blobbi gradients use url(#id) references
 * instead), and all event handlers (on*).
 *
 * IMPORTANT: data-* attributes are handled separately via ADD_ATTR since
 * ALLOWED_ATTR puts DOMPurify into whitelist mode which would strip them.
 */
const ALLOWED_ATTRS = [
  // Structural
  'xmlns',
  'viewBox',
  'preserveAspectRatio',
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
  'transform-origin',
  'transform-box',
  'style',
  'clip-path',
  'clip-rule',
  'mask',
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
  'patternUnits',
  'spreadMethod',
  'fx',
  'fy',
  // SMIL Animation attributes (used by tears, sleepy, dizzy, anger-rise, etc.)
  'attributeName',
  'attributeType',
  'values',
  'keyTimes',
  'keySplines',    // Used for smooth easing in sleepy mouth morphing
  'keyPoints',
  'calcMode',      // Used with keySplines for spline interpolation
  'dur',
  'begin',
  'end',
  'repeatCount',
  'repeatDur',
  'fill',          // Also used as animation fill="freeze" for anger-rise
  'from',
  'to',
  'by',
  'type',          // Used in animateTransform type="rotate" and <style type="text/css">
  'additive',
  'accumulate',
  'path',          // For animateMotion
  // Text attributes
  'text-anchor',
  'dominant-baseline',
  'font-family',
  'font-size',
  'font-weight',
];

/**
 * Forbidden event handler attributes.
 * These are blocked to prevent XSS via inline event handlers.
 */
const FORBIDDEN_ATTRS = [
  // Event handlers (comprehensive list)
  'onload',
  'onerror',
  'onclick',
  'ondblclick',
  'onmousedown',
  'onmouseup',
  'onmouseover',
  'onmouseout',
  'onmouseenter',
  'onmouseleave',
  'onmousemove',
  'onfocus',
  'onblur',
  'onkeydown',
  'onkeyup',
  'onkeypress',
  'onchange',
  'oninput',
  'onsubmit',
  'onreset',
  'onanimationend',
  'onanimationstart',
  'onanimationiteration',
  'ontransitionend',
  'ontransitionstart',
  'onbegin',       // SVG SMIL event
  'onend',         // SVG SMIL event
  'onrepeat',      // SVG SMIL event
  // Link targets — Blobbi SVGs use url(#id) for gradient refs, not href
  'href',
  'xlink:href',
];

/** Maximum SVG string length (512 KB). Blobbi SVGs with all emotion overlays are ~30 KB. */
const MAX_SVG_LENGTH = 512 * 1024;

/**
 * Configure DOMPurify once at module load time.
 *
 * We add a hook to dynamically allow all data-* attributes. When ALLOWED_ATTR
 * is specified, DOMPurify switches to strict whitelist mode and would otherwise
 * strip data-* attributes.
 *
 * The eye animation system depends on these data attributes:
 * - data-cx, data-cy: Eye center coordinates
 * - data-eye-top, data-eye-bottom: Eye bounds for clip-path animation
 * - data-clip-height: Full height of clip rect
 * - data-clip-id: Reference to the clipPath element ID
 *
 * These are all generated by our own code (eye-animation.ts), not user input.
 */
DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
  // Allow any attribute starting with "data-"
  // These are used by the eye animation system for storing geometry/state
  if (data.attrName.startsWith('data-')) {
    data.allowedAttributes[data.attrName] = true;
  }
});

/**
 * Sanitize a Blobbi SVG string before injection via `dangerouslySetInnerHTML`.
 *
 * This is the output-boundary safety net for the Blobbi rendering pipeline.
 * It strips scripts, event handlers, and other dangerous constructs while
 * preserving the gradients, animations, clip paths, and CSS that the pipeline
 * legitimately produces.
 *
 * Key features:
 * - All data-* attributes are allowed (via hook) for eye animation system
 * - SMIL animation elements and attributes are preserved
 * - CSS @keyframes in <style> tags are allowed (for emotions)
 * - Event handlers and href attributes are blocked
 *
 * What this sanitizer catches:
 * - Any <script> tags that might be injected
 * - Event handlers like onclick, onload, etc.
 * - Links via href/xlink:href
 * - Dangerous elements like foreignObject, iframe, etc.
 */
export function sanitizeBlobbiSvg(dirty: string): string {
  if (dirty.length > MAX_SVG_LENGTH) {
    if (import.meta.env.DEV) {
      console.warn('[sanitizeBlobbiSvg] SVG exceeds max length, rejecting');
    }
    return '';
  }

  // Note: We do NOT use USE_PROFILES because the SVG profile has its own
  // internal whitelist that conflicts with our explicit ALLOWED_TAGS/ALLOWED_ATTR.
  // Instead, we explicitly define what's allowed, which gives us full control.
  return DOMPurify.sanitize(dirty, {
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
    FORBID_ATTR: FORBIDDEN_ATTRS,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  }) as string;
}
