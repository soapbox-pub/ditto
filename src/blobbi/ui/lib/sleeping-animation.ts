/**
 * Sleeping Animation
 *
 * Adds CSS keyframe animations to the pre-baked sleeping SVG assets.
 * The sleeping SVGs already contain closed eyes, peaceful mouth, and Zzz text
 * elements — this module animates them so sleeping feels alive rather than static.
 *
 * This is NOT the "sleepy" emotion (low-energy drowsy blink cycle).
 * This is the actual sleeping state animation — eyes stay fully closed,
 * Zzz floats gently, and the body breathes subtly.
 */

/**
 * CSS keyframe animations injected into sleeping SVGs.
 *
 * - `sleeping-zzz-float`:  Zzz text rises and fades in a loop
 * - `sleeping-breathe`:    Subtle body scale pulse (inhale/exhale)
 */
function generateSleepingStyles(): string {
  return `
  <style type="text/css">
    @keyframes sleeping-zzz-float {
      0%   { opacity: 0;   transform: translateY(0); }
      15%  { opacity: 0.8; transform: translateY(-2px); }
      50%  { opacity: 1;   transform: translateY(-6px); }
      85%  { opacity: 0.4; transform: translateY(-10px); }
      100% { opacity: 0;   transform: translateY(-12px); }
    }
    @keyframes sleeping-breathe {
      0%, 100% { transform: scaleY(1) translateY(0); }
      50%      { transform: scaleY(1.012) translateY(-0.3px); }
    }
    .blobbi-sleeping-zzz text:nth-child(1) {
      animation: sleeping-zzz-float 3.5s ease-in-out infinite;
    }
    .blobbi-sleeping-zzz text:nth-child(2) {
      animation: sleeping-zzz-float 3.5s ease-in-out 0.6s infinite;
    }
    .blobbi-sleeping-zzz text:nth-child(3) {
      animation: sleeping-zzz-float 3.5s ease-in-out 1.2s infinite;
    }
    .blobbi-sleeping-body {
      transform-origin: center bottom;
      animation: sleeping-breathe 4s ease-in-out infinite;
    }
  </style>`;
}

/**
 * Wrap existing Zzz `<text>` elements in a group with the animation class.
 *
 * The sleeping SVGs contain 2-3 `<text>` elements with "Z" / "z" content.
 * We wrap them in a `<g class="blobbi-sleeping-zzz">` so the CSS animation
 * applies to each one with staggered delays.
 *
 * Matching strategy: find consecutive `<text ...>Z</text>` / `<text ...>z</text>`
 * lines near the end of the SVG and wrap the whole group.
 */
function wrapZzzElements(svgText: string): string {
  // Match a cluster of 2-3 <text> elements containing Z/z near each other.
  // These appear at the end of the sleeping SVGs before </svg>.
  const zzzPattern = /((?:\s*<text[^>]*>[Zz]<\/text>\s*){2,3})/;
  const match = svgText.match(zzzPattern);
  if (!match) return svgText;

  const zzzBlock = match[1];
  const wrapped = `<g class="blobbi-sleeping-zzz">\n${zzzBlock}\n  </g>`;
  return svgText.replace(zzzBlock, wrapped);
}

/**
 * Wrap the main body `<path>` in a group with the breathing animation class.
 *
 * The sleeping SVGs have a body `<path>` as the first significant element after <defs>.
 * We wrap the body path plus any inner glow ellipses in a breathing group.
 *
 * Strategy: find the first `<path` element (the body) and wrap everything from
 * it through the first `<!-- Sleeping eyes -->` or eye `<path` in a group.
 * If that's too fragile, wrap just the main body path.
 */
function wrapBodyForBreathing(svgText: string): string {
  // Find the main body path — it's always the first <path after </defs> or comments
  // We look for a <path that uses fill="url(#blobbi..." which is the body gradient
  const bodyPathPattern = /(<path[^>]*fill="url\(#blobbi[^"]*Gradient[^"]*\)"[^>]*\/>)/;
  const match = svgText.match(bodyPathPattern);
  if (!match) return svgText;

  const bodyPath = match[1];
  // Also try to include the soft inner glow ellipse if it follows
  const bodyWithGlow = new RegExp(
    escapeRegExp(bodyPath) + '(\\s*\\n\\s*<!--[^>]*-->\\s*\\n\\s*<ellipse[^/]*/\\s*>)?'
  );
  const glowMatch = svgText.match(bodyWithGlow);

  if (glowMatch) {
    const fullBlock = glowMatch[0];
    const wrapped = `<g class="blobbi-sleeping-body">\n    ${fullBlock}\n    </g>`;
    return svgText.replace(fullBlock, wrapped);
  }

  // Fallback: wrap just the body path
  const wrapped = `<g class="blobbi-sleeping-body">${bodyPath}</g>`;
  return svgText.replace(bodyPath, wrapped);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Apply sleeping animation to a pre-baked sleeping SVG.
 *
 * Call this from both BlobbiBabySvgRenderer and BlobbiAdultSvgRenderer
 * in the `isSleeping` path. The input must be a colorized sleeping SVG
 * (already resolved via the sleeping SVG variant).
 *
 * Adds:
 * 1. CSS keyframe animation styles
 * 2. Wraps Zzz text elements in an animated group
 * 3. Wraps the body in a subtle breathing animation group
 */
export function applySleepingAnimation(svgText: string): string {
  // 1. Inject CSS animations into <defs> or after <svg> tag
  const styles = generateSleepingStyles();
  if (svgText.includes('<defs>')) {
    svgText = svgText.replace('<defs>', '<defs>' + styles);
  } else {
    svgText = svgText.replace(/(<svg[^>]*>)/, '$1' + styles);
  }

  // 2. Wrap Zzz elements for staggered float animation
  svgText = wrapZzzElements(svgText);

  // 3. Wrap body for breathing animation
  svgText = wrapBodyForBreathing(svgText);

  return svgText;
}
