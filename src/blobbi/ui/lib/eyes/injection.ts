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
 *   <g class="blobbi-eye blobbi-eye-{side}">  <!-- CSS animation layer (e.g., sleepy wake-glance) -->
 *     <g class="blobbi-eye-gaze blobbi-eye-gaze-{side}">  <!-- gaze tracking layer -->
 *       <circle ... />  <!-- pupil -->
 *       <circle ... />  <!-- highlight(s) -->
 *       <!-- TRACKING EFFECT LAYER: Insert tracking effects here (e.g., sad highlights, stars) -->
 *     </g>
 *   </g>
 * </g>
 */

import { EyeSide, EYE_CLASSES } from './types';

// ─── Layer Injection ──────────────────────────────────────────────────────────

/**
 * Inject markup into the eye tracking layer (blobbi-eye-gaze group).
 *
 * Content injected here will:
 * - Track with eye movement (follow mouse/gaze)
 * - Participate in blink animation
 *
 * Use for: Replacement pupils (stars, hearts), tracking highlights
 *
 * Note: This targets the innermost gaze group (.blobbi-eye-gaze), not .blobbi-eye.
 * The .blobbi-eye layer is for CSS animations; gaze transforms happen in .blobbi-eye-gaze.
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
  // Find the blobbi-eye-gaze group (innermost tracking group) and inject before closing </g>
  // Use balanced group matching to handle nested groups correctly
  const gazeGroupStart = svgText.indexOf(`class="${EYE_CLASSES.gaze} ${EYE_CLASSES.gaze}-${side}"`);
  if (gazeGroupStart === -1) {
    // Fallback: try alternate class order
    const altStart = svgText.indexOf(`class="${EYE_CLASSES.gaze}-${side}`);
    if (altStart === -1) return svgText;
  }
  
  // Find opening <g tag that contains this class
  const beforeClass = svgText.lastIndexOf('<g', gazeGroupStart);
  if (beforeClass === -1) return svgText;
  
  // Find the end of the opening tag
  const openTagEnd = svgText.indexOf('>', gazeGroupStart);
  if (openTagEnd === -1) return svgText;
  
  // Find the matching closing </g> using balanced parsing
  const closingIndex = findMatchingCloseTag(svgText, openTagEnd + 1, 'g');
  if (closingIndex === -1) return svgText;
  
  // Insert markup just before the closing </g>
  return svgText.slice(0, closingIndex) + `\n        ${markup}\n      ` + svgText.slice(closingIndex);
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
  const clipRectRegex = new RegExp(
    `<rect\\s+class="${EYE_CLASSES.clipRect}"\\s+x="([^"]+)"\\s+y="([^"]+)"\\s+width="([^"]+)"\\s+height="([^"]+)"\\s*/>`,
    'g'
  );

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

    return `<rect class="${EYE_CLASSES.clipRect}" x="${x}" y="${y}" width="${width}" height="${height}">
        <animate attributeName="y" values="${yValues}" keyTimes="${keyTimesStr}" dur="${duration}s" repeatCount="indefinite" calcMode="spline" keySplines="${keySplines}" />
        <animate attributeName="height" values="${heightValues}" keyTimes="${keyTimesStr}" dur="${duration}s" repeatCount="indefinite" calcMode="spline" keySplines="${keySplines}" />
      </rect>`;
  });
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Find the matching closing tag for a given element type, handling nested elements.
 * 
 * @param svgText - The SVG content
 * @param startIndex - Index to start searching from (after opening tag)
 * @param tagName - The tag name to match (e.g., 'g')
 * @returns Index of the opening '<' of the closing tag, or -1 if not found
 */
function findMatchingCloseTag(svgText: string, startIndex: number, tagName: string): number {
  let depth = 1;
  let i = startIndex;
  const openPattern = new RegExp(`<${tagName}(?:\\s|>)`, 'gi');
  const closePattern = new RegExp(`</${tagName}>`, 'gi');
  
  while (i < svgText.length && depth > 0) {
    // Look for next open or close tag
    openPattern.lastIndex = i;
    closePattern.lastIndex = i;
    
    const openMatch = openPattern.exec(svgText);
    const closeMatch = closePattern.exec(svgText);
    
    if (!closeMatch) return -1; // No more closing tags
    
    // Check which comes first
    if (!openMatch || closeMatch.index < openMatch.index) {
      // Closing tag comes first
      depth--;
      if (depth === 0) {
        return closeMatch.index;
      }
      i = closeMatch.index + closeMatch[0].length;
    } else {
      // Opening tag comes first
      depth++;
      i = openMatch.index + openMatch[0].length;
    }
  }
  
  return -1;
}

/**
 * Find a group element by class pattern and return its boundaries.
 * 
 * @param svgText - The SVG content
 * @param classPattern - Pattern to match in the class attribute
 * @returns Object with openTagStart, openTagEnd, closeTagStart, closeTagEnd, or null
 */
function findGroupByClass(
  svgText: string,
  classPattern: string
): { openTagStart: number; openTagEnd: number; closeTagStart: number; closeTagEnd: number } | null {
  // Find the class attribute
  const classIndex = svgText.indexOf(classPattern);
  if (classIndex === -1) return null;
  
  // Find the opening <g that contains this class
  const openTagStart = svgText.lastIndexOf('<g', classIndex);
  if (openTagStart === -1) return null;
  
  // Find the end of the opening tag
  const openTagEnd = svgText.indexOf('>', classIndex);
  if (openTagEnd === -1) return null;
  
  // Find the matching closing </g> using balanced parsing
  const closeTagStart = findMatchingCloseTag(svgText, openTagEnd + 1, 'g');
  if (closeTagStart === -1) return null;
  
  const closeTagEnd = closeTagStart + 4; // '</g>'.length
  
  return { openTagStart, openTagEnd: openTagEnd + 1, closeTagStart, closeTagEnd };
}

/**
 * Modify the content inside an eye gaze group.
 * 
 * This targets the innermost .blobbi-eye-gaze group to modify pupils/highlights.
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
  // Target the gaze group (innermost) instead of eye group
  // This contains the actual pupil and highlight elements
  const classPattern = `class="${EYE_CLASSES.gaze} ${EYE_CLASSES.gaze}-${side}"`;
  const bounds = findGroupByClass(svgText, classPattern);
  
  if (!bounds) {
    // Fallback: try alternate class order
    const altPattern = `class="${EYE_CLASSES.gaze}-${side}`;
    const altBounds = findGroupByClass(svgText, altPattern);
    if (!altBounds) return svgText;
    
    const content = svgText.substring(altBounds.openTagEnd, altBounds.closeTagStart);
    const modifiedContent = modifier(content);
    return svgText.substring(0, altBounds.openTagEnd) + modifiedContent + svgText.substring(altBounds.closeTagStart);
  }
  
  const content = svgText.substring(bounds.openTagEnd, bounds.closeTagStart);
  const modifiedContent = modifier(content);
  
  return svgText.substring(0, bounds.openTagEnd) + modifiedContent + svgText.substring(bounds.closeTagStart);
}
