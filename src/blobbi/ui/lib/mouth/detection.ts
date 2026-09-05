/**
 * Mouth Detection
 *
 * Detects the mouth position from Blobbi SVG content.
 * Uses three strategies, in order:
 * 1. Semantic: Q-curve paths whose stroke references a mouth gradient
 *    (`url(#cattiMouth3D)`, `url(#froggiMouthHighlight)`, `url(#crystiSmile)`).
 *    This is the canonical artwork's own structure and needs no comment.
 * 2. Marker: Look for <!-- Mouth --> marker and extract elements after it
 * 3. Fallback: Regex-based Q-curve path matching (first plausible path)
 *
 * Why the semantic strategy exists: multi-path mouths (Catti's two halves,
 * Froggi's mouth + highlight) were only recognised as ONE mouth through the
 * marker. When Ditto's inlined artwork was minified (comments stripped) the
 * regex fallback silently took over: it saw Catti's left half as the whole
 * mouth (centre x=91 instead of 100) and its replacement deleted every other
 * single-Q stroke path in the drawing, Catti's whiskers and six of Froggi's
 * feature strokes included. The gradient reference survives minification and
 * id namespacing, so the result no longer depends on comments being present.
 */

import type { MouthPosition, MouthDetectionResult, MouthAnchor } from './types';

// ─── Semantic Detection ───────────────────────────────────────────────────────

/** A self-closing single-Q-curve path carrying a stroke (the mouth path shape). */
const SINGLE_Q_STROKE_PATH = /<path[^>]*d="M\s*[\d.]+\s+[\d.]+\s*Q\s*[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+"[^>]*stroke[^>]*\/>/g;
/** A stroke that references a gradient named for the mouth (ids may be namespaced: `b_x_cattiMouth3D`). */
const MOUTH_STROKE_REF = /\sstroke="url\(#[^)"]*(?:mouth|smile)[^)"]*\)"/i;

interface LocatedPath {
  match: string;
  index: number;
}

/** Every single-Q stroke path whose stroke is a mouth/smile gradient, in document order. */
function findSemanticMouthPaths(svgText: string): LocatedPath[] {
  const found: LocatedPath[] = [];
  SINGLE_Q_STROKE_PATH.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SINGLE_Q_STROKE_PATH.exec(svgText)) !== null) {
    if (MOUTH_STROKE_REF.test(m[0])) found.push({ match: m[0], index: m.index });
  }
  return found;
}

/**
 * Detect the mouth from the artwork's own gradient references. The position
 * spans every mouth path (both halves of a two-path mouth), exactly as the
 * marker strategy computes it.
 */
function detectMouthBySemanticStroke(svgText: string): MouthDetectionResult | null {
  const paths = findSemanticMouthPaths(svgText);
  if (paths.length === 0) return null;
  const mouthElements = paths.map((p) => p.match).join('\n');
  const position = extractMouthPositionFromElements(mouthElements);
  if (!position) return null;
  const last = paths[paths.length - 1];
  return {
    position,
    mouthElements,
    startIndex: paths[0].index,
    endIndex: last.index + last.match.length,
  };
}

/**
 * Replace ONLY the semantic mouth paths: the first becomes the new mouth, the
 * others are removed. Returns null when the drawing has no mouth gradient.
 */
function replaceMouthBySemanticStroke(svgText: string, newMouthSvg: string): string | null {
  const paths = findSemanticMouthPaths(svgText);
  if (paths.length === 0) return null;
  let result = svgText;
  // Splice from the end so earlier indices stay valid.
  for (let i = paths.length - 1; i >= 0; i--) {
    const { index, match } = paths[i];
    result = result.slice(0, index) + (i === 0 ? newMouthSvg : '') + result.slice(index + match.length);
  }
  return result;
}

// ─── Main Detection ───────────────────────────────────────────────────────────

/**
 * Detect mouth position from SVG content.
 *
 * Strategy:
 * 1. Semantic: paths stroked with a mouth/smile gradient (comment-independent)
 * 2. Marker: Look for <!-- Mouth --> marker and extract elements after it
 * 3. Fallback: Use regex to find mouth-like Q curve paths
 */
export function detectMouthPosition(svgText: string): MouthDetectionResult | null {
  const semanticResult = detectMouthBySemanticStroke(svgText);
  if (semanticResult) {
    return semanticResult;
  }
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
 *
 * When the mouth section contains multiple Q-curve paths (e.g. Catti's
 * dual cat-mouth), computes the full horizontal extent across all paths
 * so the detected position represents the whole mouth, not just the
 * first half.  Single-path mouths are unaffected.
 */
function extractMouthPositionFromElements(elements: string): MouthPosition | null {
  const qCurveRegex = /d="M\s*([\d.]+)\s+([\d.]+)\s*Q\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"/g;
  const firstMatch = qCurveRegex.exec(elements);
  if (!firstMatch) {
    return null;
  }

  const strokeWidthMatch = elements.match(/stroke-width="([^"]*)"/);
  const strokeWidth = strokeWidthMatch ? strokeWidthMatch[1] : '2.5';

  // Start from the first path's coordinates
  let minX = Math.min(parseFloat(firstMatch[1]), parseFloat(firstMatch[5]));
  let maxX = Math.max(parseFloat(firstMatch[1]), parseFloat(firstMatch[5]));
  const startY = parseFloat(firstMatch[2]);
  const controlY = parseFloat(firstMatch[4]);
  const endY = parseFloat(firstMatch[6]);

  // Widen bounds with any additional Q-curve paths in the section
  let extra: RegExpExecArray | null;
  while ((extra = qCurveRegex.exec(elements)) !== null) {
    minX = Math.min(minX, parseFloat(extra[1]), parseFloat(extra[5]));
    maxX = Math.max(maxX, parseFloat(extra[1]), parseFloat(extra[5]));
  }

  return {
    startX: minX,
    startY,
    controlX: (minX + maxX) / 2,
    controlY,
    endX: maxX,
    endY,
    strokeAttrs: `stroke="#1f2937" stroke-width="${strokeWidth}"`,
  };
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
 * Uses three strategies in order:
 * 0. Semantic: only paths stroked with a mouth/smile gradient are touched,
 *    whatever comments the drawing carries.
 * 1. Marker-bounded: If a <!-- Mouth --> marker exists, only replace Q-curve
 *    paths within the marker section. This prevents non-mouth paths (e.g.
 *    Catti's whiskers) from being matched and destroyed.
 * 2. Global fallback: Replace the first global Q-curve match (legacy behavior
 *    for SVGs without markers).
 */
export function replaceMouthSection(svgText: string, newMouthSvg: string): string {
  // Strategy 0: semantic replacement (mouth-gradient strokes only)
  const semanticResult = replaceMouthBySemanticStroke(svgText, newMouthSvg);
  if (semanticResult !== null) {
    return semanticResult;
  }

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
  
  // Also match blobbi-mouth elements with children (non-self-closing, e.g. animated paths/ellipses)
  // Pattern: <path|ellipse class="...blobbi-mouth..." ...>...</path|ellipse>
  const openCloseMouthRegex = /<(path|ellipse)[^>]*class="[^"]*blobbi-mouth[^"]*"[^>]*>[\s\S]*?<\/\1>/g;
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
