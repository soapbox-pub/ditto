/**
 * Blobbi Eye System - Detection Module
 *
 * This module provides functions for detecting and extracting eye data from SVG content.
 * It is the single source of truth for eye detection logic.
 *
 * Detection strategies (in order of preference):
 * 1. Processed SVG: Look for blobbi-eye groups with data attributes
 * 2. Raw SVG: Parse circle/ellipse elements to identify eyes by color/gradient patterns
 */

import {
  EyePosition,
  ProcessedEyeData,
  EyeSide,
  EYE_CLASSES,
  EYE_DATA_ATTRS,
} from './types';

import {
  PUPIL_COLORS,
  EYE_PROXIMITY,
  EYE_WHITE_MIN_RADIUS,
} from '../constants';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Raw element info extracted from SVG parsing.
 * Used internally during detection.
 */
interface RawElementInfo {
  /** The full SVG element string */
  match: string;
  /** Start index in the SVG string */
  index: number;
  /** End index in the SVG string */
  endIndex: number;
  /** Center X coordinate */
  cx: number;
  /** Center Y coordinate */
  cy: number;
  /** Element type */
  type: 'eye-white' | 'pupil' | 'highlight' | 'other';
  /** Approximate radius */
  radius: number;
}

/**
 * Grouped eye elements found in raw SVG.
 * Used internally during detection.
 */
interface RawEyeGroup {
  /** Eye white element (if found) */
  eyeWhite: RawElementInfo | null;
  /** Pupil element */
  pupil: RawElementInfo;
  /** Highlight elements */
  highlights: RawElementInfo[];
  /** Left or right eye */
  side: EyeSide;
  /** Blink center X - from eye white if available, otherwise from pupil */
  blinkCenterX: number;
  /** Blink center Y - from eye white if available, otherwise from pupil */
  blinkCenterY: number;
  /** Eye white geometry for eyelid generation (rx, ry for ellipse) */
  eyeWhiteGeometry: { rx: number; ry: number } | null;
}

// ─── Primary Detection API ────────────────────────────────────────────────────

/**
 * Detect eye positions from SVG content.
 *
 * This is the primary entry point for eye detection. It first attempts to find
 * processed eye groups (from eye-animation.ts), then falls back to raw SVG parsing.
 *
 * @param svgText - The SVG content to analyze
 * @returns Array of detected eye positions
 */
export function detectEyePositions(svgText: string): EyePosition[] {
  // First try to find processed blobbi-eye groups
  const processedEyes = detectFromProcessedSvg(svgText);
  if (processedEyes.length > 0) {
    return processedEyes;
  }

  // Fall back to raw SVG parsing
  return detectFromRawSvg(svgText);
}

/**
 * Extract complete processed eye data from SVG.
 *
 * This extracts all available eye information including clip-path data,
 * geometry, and positions. Use this when you need full eye metadata.
 *
 * @param svgText - The processed SVG content
 * @returns Array of processed eye data, or empty if not a processed SVG
 */
export function extractProcessedEyes(svgText: string): ProcessedEyeData[] {
  const eyes: ProcessedEyeData[] = [];

  // Look for blobbi-blink groups which contain all the metadata
  const blinkGroupRegex = new RegExp(
    `<g[^>]*class="[^"]*${EYE_CLASSES.blink}[^"]*"[^>]*>`,
    'g'
  );

  let match;
  while ((match = blinkGroupRegex.exec(svgText)) !== null) {
    const groupTag = match[0];

    // Extract side from class
    const sideMatch = groupTag.match(/blobbi-blink-(left|right)/);
    if (!sideMatch) continue;
    const side = sideMatch[1] as EyeSide;

    // Extract data attributes (try new format first, then legacy for backwards compat)
    const cx = extractDataAttr(groupTag, EYE_DATA_ATTRS.cx) ??
               extractDataAttr(groupTag, EYE_DATA_ATTRS.legacyCx);
    const cy = extractDataAttr(groupTag, EYE_DATA_ATTRS.cy) ??
               extractDataAttr(groupTag, EYE_DATA_ATTRS.legacyCy);
    const clipId = extractStringAttr(groupTag, EYE_DATA_ATTRS.clipId);
    // New format uses data-clip-top, legacy uses data-eye-top
    const clipTop = extractDataAttr(groupTag, EYE_DATA_ATTRS.clipTop) ??
                    extractDataAttr(groupTag, EYE_DATA_ATTRS.legacyEyeTop);
    const clipHeight = extractDataAttr(groupTag, EYE_DATA_ATTRS.clipHeight);

    if (cx === null || cy === null) continue;

    // Find the pupil radius within this context
    const afterMatch = svgText.slice(match.index, match.index + 500);
    const radiusMatch = afterMatch.match(/\br="([\d.]+)"/);
    const radius = radiusMatch ? parseFloat(radiusMatch[1]) : 6;

    // Extract eye white geometry if available
    const eyeWhiteRx = extractDataAttr(groupTag, EYE_DATA_ATTRS.rx);
    const eyeWhiteRy = extractDataAttr(groupTag, EYE_DATA_ATTRS.ry);

    eyes.push({
      geometry: {
        cx,
        cy,
        radius,
        side,
        eyeWhiteRx: eyeWhiteRx ?? undefined,
        eyeWhiteRy: eyeWhiteRy ?? undefined,
      },
      side,
      clipId: clipId || `blobbi-blink-clip-${side}`,
      clipTop: clipTop ?? cy - radius,
      clipHeight: clipHeight ?? radius * 2,
    });
  }

  return eyes;
}

// ─── Detection from Processed SVG ─────────────────────────────────────────────

/**
 * Detect eyes from processed SVG (with blobbi-eye groups).
 * 
 * Supports both old structure (.blobbi-eye contains pupils directly)
 * and new structure (.blobbi-eye > .blobbi-eye-gaze contains pupils).
 */
function detectFromProcessedSvg(svgText: string): EyePosition[] {
  const eyes: EyePosition[] = [];

  // Look for blobbi-eye groups - flexible matching for class attribute order
  // Matches: class="blobbi-eye blobbi-eye-left" or class="blobbi-eye-left blobbi-eye" etc.
  const eyeGroupRegex = /class="[^"]*blobbi-eye-(left|right)[^"]*"/g;
  let match;
  const processedSides = new Set<string>();

  while ((match = eyeGroupRegex.exec(svgText)) !== null) {
    const side = match[1] as EyeSide;
    
    // Skip if we already processed this side (may match both .blobbi-eye and .blobbi-eye-gaze)
    // Only process the first match per side (should be the .blobbi-eye group)
    const classContent = match[0];
    const isGazeGroup = classContent.includes('blobbi-eye-gaze');
    if (isGazeGroup || processedSides.has(side)) continue;
    processedSides.add(side);

    // Find the parent blink group and extract eye center coordinates
    // The blink group contains data-eye-cx and data-eye-cy
    const beforeMatch = svgText.slice(0, match.index);
    
    // More flexible matching: data attributes can be in any order
    // Find the nearest blobbi-blink group opening tag before this
    const blinkGroupStart = beforeMatch.lastIndexOf('blobbi-blink');
    if (blinkGroupStart === -1) continue;
    
    // Extract the full opening tag of the blink group
    const blinkTagStart = beforeMatch.lastIndexOf('<g', blinkGroupStart);
    const blinkTagEnd = beforeMatch.indexOf('>', blinkGroupStart);
    if (blinkTagStart === -1 || blinkTagEnd === -1) continue;
    
    const blinkTag = beforeMatch.slice(blinkTagStart, blinkTagEnd + 1);
    
    // Extract data-eye-cx and data-eye-cy (or legacy data-cx/data-cy)
    const cxMatch = blinkTag.match(/data-eye-cx="([\d.]+)"/) || blinkTag.match(/data-cx="([\d.]+)"/);
    const cyMatch = blinkTag.match(/data-eye-cy="([\d.]+)"/) || blinkTag.match(/data-cy="([\d.]+)"/);
    
    if (!cxMatch || !cyMatch) continue;
    
    const cx = parseFloat(cxMatch[1]);
    const cy = parseFloat(cyMatch[1]);

    // Estimate radius from nearby pupil circle (search forward)
    const afterMatch = svgText.slice(match.index, match.index + 500);
    const radiusMatch = afterMatch.match(/\br="([\d.]+)"/);
    const radius = radiusMatch ? parseFloat(radiusMatch[1]) : 6;

    // Extract eye white vertical radius if available (written by addEyeAnimation)
    const eyeWhiteRyMatch = blinkTag.match(/data-eye-ry="([\d.]+)"/);
    const eyeWhiteRy = eyeWhiteRyMatch ? parseFloat(eyeWhiteRyMatch[1]) : undefined;

    eyes.push({ cx, cy, radius, side, eyeWhiteRy });
  }

  return eyes;
}

// ─── Detection from Raw SVG ───────────────────────────────────────────────────

/**
 * Detect eyes from raw SVG by analyzing circle/ellipse elements.
 */
function detectFromRawSvg(svgText: string): EyePosition[] {
  // Parse all circle/ellipse elements
  const elements = parseElements(svgText);

  // Group elements into complete eyes
  const eyeGroups = groupEyeElements(elements);

  // Convert to EyePosition format
  return eyeGroups.map((group) => ({
    cx: group.blinkCenterX,
    cy: group.blinkCenterY,
    radius: group.pupil.radius,
    side: group.side,
  }));
}

/**
 * Parse SVG and extract all circle/ellipse elements with their types.
 */
function parseElements(svgText: string): RawElementInfo[] {
  const elementRegex = /<(circle|ellipse)[^>]*\/>/g;
  const elements: RawElementInfo[] = [];

  let match;
  while ((match = elementRegex.exec(svgText)) !== null) {
    const geometry = getElementGeometry(match[0]);
    if (!geometry) continue;

    let type: RawElementInfo['type'] = 'other';

    if (isPupilElement(match[0])) {
      type = 'pupil';
    } else if (isEyeWhiteElement(match[0], geometry.radius)) {
      type = 'eye-white';
    } else if (isHighlightElement(match[0], geometry.radius)) {
      type = 'highlight';
    }

    elements.push({
      match: match[0],
      index: match.index,
      endIndex: match.index + match[0].length,
      cx: geometry.cx,
      cy: geometry.cy,
      radius: geometry.radius,
      type,
    });
  }

  return elements;
}

/**
 * Group detected elements into complete eyes based on proximity.
 */
function groupEyeElements(elements: RawElementInfo[]): RawEyeGroup[] {
  const pupils = elements.filter((e) => e.type === 'pupil');
  const eyeWhites = elements.filter((e) => e.type === 'eye-white');
  const highlights = elements.filter((e) => e.type === 'highlight');

  if (pupils.length === 0) return [];

  // Determine left/right based on X positions
  const sortedPupils = [...pupils].sort((a, b) => a.cx - b.cx);
  const midX =
    sortedPupils.length > 1
      ? (sortedPupils[0].cx + sortedPupils[sortedPupils.length - 1].cx) / 2
      : sortedPupils[0].cx;

  const groups: RawEyeGroup[] = [];
  const usedEyeWhites = new Set<RawElementInfo>();
  const usedHighlights = new Set<RawElementInfo>();

  for (const pupil of pupils) {
    // Find closest eye white to this pupil
    let closestEyeWhite: RawElementInfo | null = null;
    let closestDist = EYE_PROXIMITY;

    for (const ew of eyeWhites) {
      if (usedEyeWhites.has(ew)) continue;
      const dist = distance(pupil.cx, pupil.cy, ew.cx, ew.cy);
      if (dist < closestDist) {
        closestDist = dist;
        closestEyeWhite = ew;
      }
    }

    if (closestEyeWhite) {
      usedEyeWhites.add(closestEyeWhite);
    }

    // Find highlights near this pupil
    const nearbyHighlights = highlights.filter((h) => {
      if (usedHighlights.has(h)) return false;
      return distance(pupil.cx, pupil.cy, h.cx, h.cy) < EYE_PROXIMITY;
    });
    nearbyHighlights.forEach((h) => usedHighlights.add(h));

    // Use eye white center for blink anchor (more accurate), fallback to pupil
    const blinkAnchor = closestEyeWhite || pupil;

    // Extract eye white geometry (rx, ry) for eyelid generation
    let eyeWhiteGeometry: { rx: number; ry: number } | null = null;
    if (closestEyeWhite) {
      const rxMatch = closestEyeWhite.match.match(/rx="(\d+\.?\d*)"/);
      const ryMatch = closestEyeWhite.match.match(/ry="(\d+\.?\d*)"/);
      const rMatch = closestEyeWhite.match.match(/\br="(\d+\.?\d*)"/);

      if (rxMatch && ryMatch) {
        eyeWhiteGeometry = { rx: parseFloat(rxMatch[1]), ry: parseFloat(ryMatch[1]) };
      } else if (rMatch) {
        const r = parseFloat(rMatch[1]);
        eyeWhiteGeometry = { rx: r, ry: r };
      }
    }

    groups.push({
      eyeWhite: closestEyeWhite,
      pupil,
      highlights: nearbyHighlights,
      side: pupil.cx < midX ? 'left' : 'right',
      blinkCenterX: blinkAnchor.cx,
      blinkCenterY: blinkAnchor.cy,
      eyeWhiteGeometry,
    });
  }

  return groups;
}

// ─── Element Classification ───────────────────────────────────────────────────

/**
 * Check if element is an eye white.
 *
 * Detection criteria:
 * - EyeWhite gradients (actual white part of eye) - INCLUDE
 * - EyeBase gradients (colored eye rim, e.g., froggi's green bulge) - EXCLUDE
 * - Eye gradients without "Base" (generic eye white) - INCLUDE
 * - Plain white fills are ONLY eye whites if they're large (radius >= threshold)
 */
function isEyeWhiteElement(element: string, radius: number): boolean {
  // Extract the gradient ID from the fill attribute
  const gradientMatch = element.match(/fill="url\(#([^"]+)\)"/);

  if (gradientMatch) {
    const gradientId = gradientMatch[1];

    // EXCLUDE: EyeBase patterns (e.g., froggiEyeBase3D) - colored eye rims
    if (/[Ee]ye[Bb]ase/i.test(gradientId)) {
      return false;
    }

    // INCLUDE: EyeWhite patterns (e.g., cattiEyeWhite3D, froggiEyeWhite3D)
    if (/[Ee]ye[Ww]hite/i.test(gradientId)) {
      return true;
    }

    // INCLUDE: Generic Eye gradients without "Base"
    if (/[Ee]ye/i.test(gradientId) && !/[Bb]ase/i.test(gradientId)) {
      return true;
    }
  }

  // Check for plain white fills - must be LARGE to be an eye white
  const isWhite =
    element.includes('fill="white"') ||
    element.includes("fill='white'") ||
    element.includes('fill="#fff"') ||
    element.includes('fill="#ffffff"') ||
    element.includes('fill="#FFF"') ||
    element.includes('fill="#FFFFFF"');

  if (isWhite && radius >= EYE_WHITE_MIN_RADIUS) {
    return true;
  }

  return false;
}

/**
 * Check if element is a pupil.
 */
function isPupilElement(element: string): boolean {
  // Check for explicit pupil marker (used by flat-fill forms after eyeColor replacement)
  if (element.includes('data-blobbi-pupil')) return true;

  // Check for pupil gradient
  if (/fill="url\(#[^"]*[Pp]upil[^"]*\)"/.test(element)) {
    return true;
  }

  // Check for dark fill colors
  for (const color of PUPIL_COLORS) {
    if (element.includes(`fill="${color}"`) || element.includes(`fill='${color}'`)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if element is a highlight (white element, typically small).
 */
function isHighlightElement(element: string, radius: number): boolean {
  const isWhite =
    element.includes('fill="white"') ||
    element.includes("fill='white'") ||
    element.includes('fill="#fff"') ||
    element.includes('fill="#ffffff"') ||
    element.includes('fill="#FFF"') ||
    element.includes('fill="#FFFFFF"');

  // Highlights are white fills with radius < eye white threshold
  return isWhite && radius < EYE_WHITE_MIN_RADIUS;
}

// ─── Geometry Extraction ──────────────────────────────────────────────────────

/**
 * Extract center coordinates and radius from a circle/ellipse element.
 */
function getElementGeometry(element: string): { cx: number; cy: number; radius: number } | null {
  const cxMatch = element.match(/cx="(-?\d+\.?\d*)"/);
  const cyMatch = element.match(/cy="(-?\d+\.?\d*)"/);

  if (!cxMatch || !cyMatch) return null;

  const cx = parseFloat(cxMatch[1]);
  const cy = parseFloat(cyMatch[1]);

  // Circle: use r
  const rMatch = element.match(/\br="(\d+\.?\d*)"/);
  if (rMatch) {
    return { cx, cy, radius: parseFloat(rMatch[1]) };
  }

  // Ellipse: use average of rx and ry
  const rxMatch = element.match(/rx="(\d+\.?\d*)"/);
  const ryMatch = element.match(/ry="(\d+\.?\d*)"/);
  if (rxMatch && ryMatch) {
    const rx = parseFloat(rxMatch[1]);
    const ry = parseFloat(ryMatch[1]);
    return { cx, cy, radius: (rx + ry) / 2 };
  }

  return null;
}

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Calculate distance between two points.
 */
function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/**
 * Extract a numeric data attribute from an element tag.
 */
function extractDataAttr(tag: string, attrName: string): number | null {
  const regex = new RegExp(`${attrName}="([^"]+)"`);
  const match = tag.match(regex);
  if (!match) return null;
  const value = parseFloat(match[1]);
  return isNaN(value) ? null : value;
}

/**
 * Extract a string data attribute from an element tag.
 */
function extractStringAttr(tag: string, attrName: string): string | null {
  const regex = new RegExp(`${attrName}="([^"]+)"`);
  const match = tag.match(regex);
  return match ? match[1] : null;
}

// ─── Re-exports for convenience ───────────────────────────────────────────────

export type { RawEyeGroup, RawElementInfo };
