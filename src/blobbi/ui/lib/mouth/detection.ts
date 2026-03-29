/**
 * Mouth Detection
 * 
 * Detects the mouth position from Blobbi SVG content.
 * Uses two strategies:
 * 1. Primary: Look for <!-- Mouth --> marker and extract elements
 * 2. Fallback: Regex-based Q-curve path matching
 */

import type { MouthPosition, MouthDetectionResult } from './types';

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
 * Only targets <path> elements that match Q-curve mouth patterns.
 * Replaces the first match, removes any additional mouth paths.
 */
export function replaceMouthSection(svgText: string, newMouthSvg: string): string {
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
 * Replace any element with a `blobbi-mouth` class in the SVG.
 * 
 * This is a broader replacement than `replaceMouthSection` — it finds
 * any element (path, ellipse, etc.) that has a `blobbi-mouth` class
 * and replaces it. Used by overlays like sleepy that need to replace
 * mouths set by base emotions (which may be ellipses, not Q-curve paths).
 * 
 * Falls back to `replaceMouthSection` if no class-based mouth is found
 * (handles the case where the mouth is still the original SVG path).
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
