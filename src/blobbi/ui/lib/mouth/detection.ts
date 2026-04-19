/**
 * Mouth Detection
 * 
 * Detects the mouth position from Blobbi SVG content.
 * Uses two strategies:
 * 1. Primary: Look for <!-- Mouth --> marker and extract elements
 * 2. Fallback: Regex-based Q-curve path matching
 */

import type { MouthPosition, MouthDetectionResult, MouthAnchor } from './types';

// ─── Main Detection ───────────────────────────────────────────────────────────

/**
 * Detect mouth position from SVG content.
 * 
 * Strategy:
 * 1. Primary: Look for <!-- Mouth --> marker and extract elements after it
 * 2. Fallback: Use regex to find mouth-like Q curve paths
 */
export function detectMouthPosition(svgText: string): MouthDetectionResult | null {
  const markerResult = detectMouthByMarker(svgText);
  if (markerResult) {
    return markerResult;
  }
  return detectMouthByRegex(svgText);
}

// ─── Mouth Anchor ─────────────────────────────────────────────────────────────

/**
 * Derive a stable anchor point for the mouth area.
 * 
 * Call this on the **original/unmodified SVG** (before any emotion mouth
 * replacements) so the position is always from the neutral mouth.
 * 
 * The anchor provides a stable { cx, cy } that canonical mouth shapes
 * (like sleepy) use for positioning when they directly replace the
 * current mouth.
 * 
 * @param detection - Result from detectMouthPosition() on the original SVG
 * @returns A stable { cx, cy } anchor
 */
export function mouthAnchorFromDetection(detection: MouthDetectionResult): MouthAnchor {
  const pos = detection.position;
  return {
    cx: (pos.startX + pos.endX) / 2,
    cy: pos.controlY,
  };
}

// ─── Marker-Based Detection ───────────────────────────────────────────────────

/**
 * Detect mouth using <!-- Mouth --> marker.
 */
function detectMouthByMarker(svgText: string): MouthDetectionResult | null {
  const markerMatch = svgText.match(/<!--\s*Mouth[^>]*-->/i);
  if (!markerMatch || markerMatch.index === undefined) {
    return null;
  }
  
  const markerEndIndex = markerMatch.index + markerMatch[0].length;
  const afterMarker = svgText.slice(markerEndIndex);
  const nextSectionMatch = afterMarker.match(/(?:<!--(?!\s*Mouth)|<(?:ellipse|circle|g|rect)[^>]*(?:id|class)=)/i);
  
  const mouthEndOffset = nextSectionMatch?.index ?? afterMarker.indexOf('</svg>');
  const mouthElements = afterMarker.slice(0, mouthEndOffset).trim();
  
  const position = extractMouthPositionFromElements(mouthElements);
  if (!position) {
    return null;
  }
  
  return {
    position,
    mouthElements,
    startIndex: markerEndIndex,
    endIndex: markerEndIndex + mouthEndOffset,
  };
}

/**
 * Extract mouth position from mouth SVG elements.
 */
function extractMouthPositionFromElements(elements: string): MouthPosition | null {
  const pathMatch = elements.match(/d="M\s*([\d.]+)\s+([\d.]+)\s*Q\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"/);
  if (pathMatch) {
    const strokeWidthMatch = elements.match(/stroke-width="([^"]*)"/);
    const strokeWidth = strokeWidthMatch ? strokeWidthMatch[1] : '2.5';
    
    return {
      startX: parseFloat(pathMatch[1]),
      startY: parseFloat(pathMatch[2]),
      controlX: parseFloat(pathMatch[3]),
      controlY: parseFloat(pathMatch[4]),
      endX: parseFloat(pathMatch[5]),
      endY: parseFloat(pathMatch[6]),
      strokeAttrs: `stroke="#1f2937" stroke-width="${strokeWidth}"`,
    };
  }
  return null;
}

// ─── Regex-Based Detection ────────────────────────────────────────────────────

/**
 * Fallback: Detect mouth using regex pattern matching.
 */
function detectMouthByRegex(svgText: string): MouthDetectionResult | null {
  const mouthRegex = /<path[^>]*d="M\s*([\d.]+)\s+([\d.]+)\s*Q\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"([^>]*stroke[^>]*)\/>/g;
  
  let match;
  while ((match = mouthRegex.exec(svgText)) !== null) {
    const startX = parseFloat(match[1]);
    const startY = parseFloat(match[2]);
    const controlX = parseFloat(match[3]);
    const controlY = parseFloat(match[4]);
    const endX = parseFloat(match[5]);
    const endY = parseFloat(match[6]);
    const strokePart = match[7] || '';
    
    if (Math.abs(startY - endY) < 5 && startY > 40) {
      const strokeWidthMatch = strokePart.match(/stroke-width="([^"]*)"/);
      const strokeWidth = strokeWidthMatch ? strokeWidthMatch[1] : '2.5';
      
      return {
        position: {
          startX, startY, controlX, controlY, endX, endY,
          strokeAttrs: `stroke="#1f2937" stroke-width="${strokeWidth}"`,
        },
      };
    }
  }
  
  return null;
}

// ─── Mouth Replacement ────────────────────────────────────────────────────────

/**
 * Replace mouth <path> elements in the SVG with new mouth content.
 * 
 * Uses two strategies in order:
 * 1. Marker-bounded: If a <!-- Mouth --> marker exists, only replace Q-curve
 *    paths within the marker section. This prevents non-mouth paths (e.g.
 *    Catti's whiskers) from being matched and destroyed.
 * 2. Global fallback: Replace the first global Q-curve match (legacy behavior
 *    for SVGs without markers).
 */
export function replaceMouthSection(svgText: string, newMouthSvg: string): string {
  // Strategy 1: marker-bounded replacement
  const markerResult = replaceMouthByMarker(svgText, newMouthSvg);
  if (markerResult !== null) {
    return markerResult;
  }

  // Strategy 2: global fallback (legacy behavior)
  return replaceMouthGlobal(svgText, newMouthSvg);
}

/**
 * Replace mouth paths within the <!-- Mouth --> marker section only.
 * Returns null if no marker is found (caller should use fallback).
 */
function replaceMouthByMarker(svgText: string, newMouthSvg: string): string | null {
  const markerMatch = svgText.match(/<!--\s*Mouth[^>]*-->/i);
  if (!markerMatch || markerMatch.index === undefined) {
    return null;
  }

  const markerEnd = markerMatch.index + markerMatch[0].length;
  const afterMarker = svgText.slice(markerEnd);

  // Find the end of the mouth section: next comment or next non-path element with id/class
  const nextSectionMatch = afterMarker.match(/(?:<!--(?!\s*Mouth)|<(?:ellipse|circle|g|rect)[^>]*(?:id|class)=)/i);
  const sectionLength = nextSectionMatch?.index ?? afterMarker.indexOf('</svg>');
  const mouthSection = afterMarker.slice(0, sectionLength);

  const mouthPathRegex = /<path[^>]*d="M\s*[\d.]+\s+[\d.]+\s*Q\s*[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+"[^>]*stroke[^>]*\/>/g;
  if (!mouthPathRegex.test(mouthSection)) {
    return null;
  }

  // Replace within the section: first match → new mouth, rest → removed
  mouthPathRegex.lastIndex = 0;
  let replaced = false;
  const newSection = mouthSection.replace(mouthPathRegex, () => {
    if (!replaced) {
      replaced = true;
      return newMouthSvg;
    }
    return '';
  });

  return svgText.slice(0, markerEnd) + newSection + svgText.slice(markerEnd + sectionLength);
}

/**
 * Global fallback: replace Q-curve paths across the entire SVG.
 * Used only when no <!-- Mouth --> marker is found.
 */
function replaceMouthGlobal(svgText: string, newMouthSvg: string): string {
  const mouthPathRegex = /<path[^>]*d="M\s*[\d.]+\s+[\d.]+\s*Q\s*[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+"[^>]*stroke[^>]*\/>/g;

  const matches = svgText.match(mouthPathRegex);
  if (!matches || matches.length === 0) {
    return svgText;
  }

  let replaced = false;
  return svgText.replace(mouthPathRegex, () => {
    if (!replaced) {
      replaced = true;
      return newMouthSvg;
    }
    return '';
  });
}

/**
 * Replace the current mouth element in the SVG with new mouth content.
 * 
 * **Direct replacement**: removes the existing mouth entirely and inserts
 * the new mouth SVG. No morphing, transitioning, or interpolation.
 * 
 * Searches for mouth elements in this order:
 * 1. Self-closing elements with `blobbi-mouth` class (path, ellipse)
 * 2. Open/close elements with `blobbi-mouth` class (animated paths)
 * 3. Fallback: Q-curve path patterns (original SVG mouth)
 */
export function replaceCurrentMouth(svgText: string, newMouthSvg: string): string {
  // Match any self-closing element with blobbi-mouth class
  // Handles <path .../>, <ellipse .../>, etc.
  const classMouthRegex = /<(?:path|ellipse)[^>]*class="[^"]*blobbi-mouth[^"]*"[^>]*\/>/g;
  
  const matches = svgText.match(classMouthRegex);
  if (matches && matches.length > 0) {
    let replaced = false;
    return svgText.replace(classMouthRegex, () => {
      if (!replaced) {
        replaced = true;
        return newMouthSvg;
      }
      return '';
    });
  }
  
  // Also match blobbi-mouth elements with children (non-self-closing, e.g. animated paths)
  // Pattern: <path class="...blobbi-mouth..." ...>...</path>
  const openCloseMouthRegex = /<path[^>]*class="[^"]*blobbi-mouth[^"]*"[^>]*>[\s\S]*?<\/path>/g;
  const openCloseMatches = svgText.match(openCloseMouthRegex);
  if (openCloseMatches && openCloseMatches.length > 0) {
    let replaced = false;
    return svgText.replace(openCloseMouthRegex, () => {
      if (!replaced) {
        replaced = true;
        return newMouthSvg;
      }
      return '';
    });
  }
  
  // Fallback: try the original Q-curve path replacement
  return replaceMouthSection(svgText, newMouthSvg);
}
