/**
 * Blobbi Eye System - Injection Module
 *
 * This module provides helpers for safely injecting content into eye structures.
 * All injection should go through these helpers to ensure proper placement.
 *
 * Eye Structure (after processing by eye-animation.ts):
 *
 * <ellipse class="blobbi-eyelid blobbi-eyelid-{side}" />  <!-- eyelid back -->
 * <g class="blobbi-blink blobbi-blink-{side}" clip-path="...">  <!-- blink group -->
 *   <ellipse ... />  <!-- eye white - FIXED (doesn't track) -->
 *   <!-- FIXED EFFECT LAYER: Insert fixed effects here (e.g., water fill) -->
 *   <g class="blobbi-eye blobbi-eye-{side}">  <!-- tracking group -->
 *     <circle ... />  <!-- pupil -->
 *     <circle ... />  <!-- highlight(s) -->
 *     <!-- TRACKING EFFECT LAYER: Insert tracking effects here (e.g., sad highlights, stars) -->
 *   </g>
 * </g>
 */

import { EyeSide, EYE_CLASSES } from './types';

// ─── Layer Injection ──────────────────────────────────────────────────────────

/**
 * Inject markup into the eye tracking layer (blobbi-eye group).
 *
 * Content injected here will:
 * - Track with eye movement (follow mouse)
 * - Participate in blink animation
 *
 * Use for: Replacement pupils (stars, hearts), tracking highlights
 *
 * @param svgText - The SVG content
 * @param side - Which eye to inject into
 * @param markup - The SVG markup to inject
 * @returns Modified SVG, or original if eye group not found
 */
export function injectIntoEyeTrackLayer(
  svgText: string,
  side: EyeSide,
  markup: string
): string {
  // Find the blobbi-eye group for this side and inject before closing </g>
  const eyeGroupRegex = new RegExp(
    `(<g[^>]*class="[^"]*${EYE_CLASSES.eye}-${side}[^"]*"[^>]*>)([\\s\\S]*?)(</g>)`,
    'i'
  );

  const match = svgText.match(eyeGroupRegex);
  if (!match) {
    return svgText;
  }

  // Insert markup at the end of the group content (so it renders on top)
  return svgText.replace(
    eyeGroupRegex,
    `$1$2\n    ${markup}\n  $3`
  );
}

/**
 * Inject markup into the eye fixed layer (blobbi-blink group, before blobbi-eye).
 *
 * Content injected here will:
 * - Stay fixed (not track with eye movement)
 * - Participate in blink animation
 *
 * Use for: Water fill effects, fixed overlays
 *
 * @param svgText - The SVG content
 * @param side - Which eye to inject into
 * @param markup - The SVG markup to inject
 * @returns Modified SVG, or original if blink group not found
 */
export function injectIntoEyeFixedLayer(
  svgText: string,
  side: EyeSide,
  markup: string
): string {
  // Find the blobbi-blink group and insert after eye white, before blobbi-eye
  // Structure: <g class="blobbi-blink-{side}" ...>
  //              <ellipse ... /> <!-- eye white -->
  //              <!-- INSERT HERE -->
  //              <g class="blobbi-eye-{side}"> <!-- tracking group -->
  const blinkGroupRegex = new RegExp(
    `(<g[^>]*class="[^"]*${EYE_CLASSES.blink}-${side}[^"]*"[^>]*>)` + // Opening blink tag
    `([\\s\\S]*?)` + // Content before blobbi-eye (eye white is here)
    `(<g[^>]*class="[^"]*${EYE_CLASSES.eye}-${side}[^"]*"[^>]*>)`, // Opening blobbi-eye tag
    'i'
  );

  const match = svgText.match(blinkGroupRegex);
  if (!match) {
    return svgText;
  }

  const [fullMatch, blinkOpenTag, contentBetween, eyeOpenTag] = match;

  // Insert markup after eye white but before blobbi-eye group
  const replacement = `${blinkOpenTag}${contentBetween}${markup}\n    ${eyeOpenTag}`;
  return svgText.replace(fullMatch, replacement);
}

// ─── Element Visibility ───────────────────────────────────────────────────────

/**
 * Hide default pupils in the specified eye.
 *
 * This hides the original pupil circles by adding opacity="0".
 * Use when replacing pupils with custom elements (stars, spirals, etc.).
 *
 * @param svgText - The SVG content
 * @param side - Which eye to modify ('left', 'right', or 'both')
 * @returns Modified SVG
 */
export function hideDefaultPupils(
  svgText: string,
  side: EyeSide | 'both'
): string {
  const sides: EyeSide[] = side === 'both' ? ['left', 'right'] : [side];

  for (const s of sides) {
    svgText = modifyEyeGroupContent(svgText, s, (content) => {
      // Hide circles that are NOT white (pupils are dark colored)
      // Match circles without fill="white" and add opacity="0"
      return content.replace(
        /<circle([^>]*fill="(?!white)[^"]*"[^/]*)\s*\/>/gi,
        '<circle$1 opacity="0" />'
      );
    });
  }

  return svgText;
}

/**
 * Hide default highlights in the specified eye.
 *
 * This hides the original white highlight circles by adding opacity="0".
 * Use when replacing highlights with custom elements.
 *
 * @param svgText - The SVG content
 * @param side - Which eye to modify ('left', 'right', or 'both')
 * @returns Modified SVG
 */
export function hideDefaultHighlights(
  svgText: string,
  side: EyeSide | 'both'
): string {
  const sides: EyeSide[] = side === 'both' ? ['left', 'right'] : [side];

  for (const s of sides) {
    svgText = modifyEyeGroupContent(svgText, s, (content) => {
      // Hide white circles (highlights)
      return content.replace(
        /<circle([^>]*fill="white"[^/]*)\s*\/>/gi,
        '<circle$1 opacity="0" />'
      );
    });
  }

  return svgText;
}

// ─── Defs and Styles Injection ────────────────────────────────────────────────

/**
 * Add definitions (gradients, clipPaths, etc.) to the SVG defs section.
 *
 * @param svgText - The SVG content
 * @param defsMarkup - The markup to add to defs
 * @returns Modified SVG
 */
export function addEyeDefs(svgText: string, defsMarkup: string): string {
  if (svgText.includes('<defs>')) {
    return svgText.replace('<defs>', `<defs>\n    ${defsMarkup}`);
  } else {
    return svgText.replace(/(<svg[^>]*>)/, `$1\n  <defs>\n    ${defsMarkup}\n  </defs>`);
  }
}

/**
 * Add CSS styles to the SVG.
 *
 * @param svgText - The SVG content
 * @param css - The CSS content (without <style> tags)
 * @returns Modified SVG
 */
export function addEyeStyles(svgText: string, css: string): string {
  const styleBlock = `<style type="text/css">\n${css}\n  </style>`;

  if (svgText.includes('<defs>')) {
    return svgText.replace('<defs>', `<defs>\n    ${styleBlock}`);
  } else {
    return svgText.replace(/(<svg[^>]*>)/, `$1\n  ${styleBlock}`);
  }
}

/**
 * Add a class to the SVG root element.
 *
 * @param svgText - The SVG content
 * @param className - The class to add
 * @returns Modified SVG
 */
export function addSvgClass(svgText: string, className: string): string {
  return svgText.replace(/<svg([^>]*)>/, (match, attrs) => {
    if (attrs.includes('class="')) {
      return match.replace(/class="([^"]*)"/, `class="$1 ${className}"`);
    } else if (attrs.includes("class='")) {
      return match.replace(/class='([^']*)'/, `class='$1 ${className}'`);
    } else {
      return `<svg${attrs} class="${className}">`;
    }
  });
}

/**
 * Insert overlay content before the closing </svg> tag.
 *
 * @param svgText - The SVG content
 * @param overlayMarkup - The markup to insert
 * @returns Modified SVG
 */
export function insertOverlay(svgText: string, overlayMarkup: string): string {
  return svgText.replace('</svg>', `${overlayMarkup}\n</svg>`);
}

// ─── Clip-Path Blink Helpers ──────────────────────────────────────────────────

/**
 * Apply SMIL animations to clip-path rectangles for eye closing effects.
 *
 * This modifies the clip-path rects to animate their Y and height,
 * creating a smooth eye closing animation.
 *
 * @param svgText - The SVG content
 * @param duration - Animation duration in seconds
 * @param keyTimes - Array of keyframe times (0-1)
 * @param openPercents - Array of "open" percentages for each keyframe (1 = open, 0 = closed)
 * @returns Modified SVG
 */
export function animateClipPathBlink(
  svgText: string,
  duration: number,
  keyTimes: number[],
  openPercents: number[]
): string {
  // Find all clip-path rects and add SMIL animations
  const clipRectRegex = /<rect\s+class="blobbi-blink-clip-rect"\s+x="([^"]+)"\s+y="([^"]+)"\s+width="([^"]+)"\s+height="([^"]+)"\s*\/>/g;

  return svgText.replace(clipRectRegex, (match, x, y, width, height) => {
    const baseY = parseFloat(y);
    const fullHeight = parseFloat(height);

    // Calculate Y and height values for each keyframe
    const yValues = openPercents.map((pct) => {
      const closedOffset = fullHeight * (1 - pct) * 0.95;
      return baseY + closedOffset;
    }).join(';');

    const heightValues = openPercents.map((pct) => {
      const closedOffset = fullHeight * (1 - pct) * 0.95;
      return fullHeight - closedOffset;
    }).join(';');

    const keyTimesStr = keyTimes.join(';');
    const keySplines = new Array(keyTimes.length - 1).fill('0.4 0 0.6 1').join(';');

    return `<rect class="blobbi-blink-clip-rect" x="${x}" y="${y}" width="${width}" height="${height}">
        <animate attributeName="y" values="${yValues}" keyTimes="${keyTimesStr}" dur="${duration}s" repeatCount="indefinite" calcMode="spline" keySplines="${keySplines}" />
        <animate attributeName="height" values="${heightValues}" keyTimes="${keyTimesStr}" dur="${duration}s" repeatCount="indefinite" calcMode="spline" keySplines="${keySplines}" />
      </rect>`;
  });
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Modify the content inside an eye tracking group.
 *
 * @param svgText - The SVG content
 * @param side - Which eye to modify
 * @param modifier - Function that transforms the group content
 * @returns Modified SVG
 */
function modifyEyeGroupContent(
  svgText: string,
  side: EyeSide,
  modifier: (content: string) => string
): string {
  // Find the opening tag of the blobbi-eye group
  const openTagRegex = new RegExp(
    `<g[^>]*class="[^"]*${EYE_CLASSES.eye}-${side}[^"]*"[^>]*>`,
    'i'
  );

  const openMatch = svgText.match(openTagRegex);
  if (!openMatch || openMatch.index === undefined) {
    return svgText;
  }

  const openTagStart = openMatch.index;
  const openTagEnd = openTagStart + openMatch[0].length;

  // Find the matching closing </g> tag
  const afterOpenTag = svgText.substring(openTagEnd);
  const closeTagIndex = afterOpenTag.indexOf('</g>');

  if (closeTagIndex === -1) {
    return svgText;
  }

  const content = afterOpenTag.substring(0, closeTagIndex);
  const absoluteCloseStart = openTagEnd + closeTagIndex;

  // Apply the modifier and reconstruct
  const modifiedContent = modifier(content);

  return svgText.substring(0, openTagEnd) + modifiedContent + svgText.substring(absoluteCloseStart);
}
