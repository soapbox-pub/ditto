/**
 * Eye Animation Utility
 *
 * Transforms SVG content to add eye movement capability.
 * Wraps pupil and highlight elements in <g> groups that can be animated.
 *
 * Pattern detection:
 * - Pupil: Elements with gradient IDs containing "Pupil" or dark fills
 * - Highlights: Small white circles/ellipses near pupils
 * - Eye white: NOT animated (larger white ellipses/circles)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface ElementInfo {
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
  type: 'pupil' | 'highlight' | 'other';
}

interface EyeGroup {
  /** Pupil element */
  pupil: ElementInfo;
  /** Associated highlight elements */
  highlights: ElementInfo[];
  /** Eye side (left or right) based on X position */
  side: 'left' | 'right';
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Dark colors typically used for pupils
const PUPIL_COLORS = ['#1f2937', '#374151', '#1e293b', '#111827', '#0f172a'];

// Gradient ID patterns for pupils
const PUPIL_GRADIENT_PATTERNS = [/Pupil/i];

// Max distance (in SVG units) for a highlight to be associated with a pupil
const HIGHLIGHT_PROXIMITY = 15;

// ─── Detection Helpers ────────────────────────────────────────────────────────

/**
 * Check if an element is a pupil (should be animated)
 */
function isPupilElement(element: string): boolean {
  // Check for pupil gradient fills
  for (const pattern of PUPIL_GRADIENT_PATTERNS) {
    if (pattern.test(element)) return true;
  }

  // Check for dark fill colors (common pupil colors)
  for (const color of PUPIL_COLORS) {
    if (element.includes(`fill="${color}"`) || element.includes(`fill='${color}'`)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if an element is a highlight (small white circle/ellipse)
 * These should move with the pupil
 */
function isHighlightElement(element: string): boolean {
  // Must be white
  const isWhite =
    element.includes('fill="white"') ||
    element.includes("fill='white'") ||
    element.includes('fill="#fff"') ||
    element.includes('fill="#ffffff"') ||
    element.includes('fill="#FFF"') ||
    element.includes('fill="#FFFFFF"');

  if (!isWhite) return false;

  // Must be small (radius <= 6 for circles)
  const radiusMatch = element.match(/\br="(\d+\.?\d*)"/);
  if (radiusMatch) {
    const radius = parseFloat(radiusMatch[1]);
    return radius <= 6;
  }

  // Check for small ellipse
  const rxMatch = element.match(/rx="(\d+\.?\d*)"/);
  const ryMatch = element.match(/ry="(\d+\.?\d*)"/);
  if (rxMatch && ryMatch) {
    const rx = parseFloat(rxMatch[1]);
    const ry = parseFloat(ryMatch[1]);
    return rx <= 6 && ry <= 6;
  }

  return false;
}

/**
 * Extract center coordinates from an element
 */
function getElementCenter(element: string): { cx: number; cy: number } | null {
  const cxMatch = element.match(/cx="(\d+\.?\d*)"/);
  const cyMatch = element.match(/cy="(\d+\.?\d*)"/);

  if (cxMatch && cyMatch) {
    return {
      cx: parseFloat(cxMatch[1]),
      cy: parseFloat(cyMatch[1]),
    };
  }
  return null;
}

/**
 * Calculate distance between two points
 */
function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// ─── SVG Parsing ──────────────────────────────────────────────────────────────

/**
 * Parse SVG and extract all circle/ellipse elements with their positions
 */
function parseElements(svgText: string): ElementInfo[] {
  const elementRegex = /<(circle|ellipse)[^>]*\/>/g;
  const elements: ElementInfo[] = [];

  let match;
  while ((match = elementRegex.exec(svgText)) !== null) {
    const center = getElementCenter(match[0]);
    if (!center) continue;

    let type: ElementInfo['type'] = 'other';
    if (isPupilElement(match[0])) {
      type = 'pupil';
    } else if (isHighlightElement(match[0])) {
      type = 'highlight';
    }

    elements.push({
      match: match[0],
      index: match.index,
      endIndex: match.index + match[0].length,
      cx: center.cx,
      cy: center.cy,
      type,
    });
  }

  return elements;
}

/**
 * Group pupils with their associated highlights based on proximity
 */
function groupEyeElements(elements: ElementInfo[]): EyeGroup[] {
  const pupils = elements.filter((e) => e.type === 'pupil');
  const highlights = elements.filter((e) => e.type === 'highlight');

  if (pupils.length === 0) return [];

  // Sort pupils by X position to determine left/right
  const sortedPupils = [...pupils].sort((a, b) => a.cx - b.cx);
  const midX =
    sortedPupils.length > 1
      ? (sortedPupils[0].cx + sortedPupils[sortedPupils.length - 1].cx) / 2
      : sortedPupils[0].cx;

  const groups: EyeGroup[] = [];
  const usedHighlights = new Set<ElementInfo>();

  for (const pupil of pupils) {
    // Find highlights near this pupil (that haven't been used)
    const nearbyHighlights = highlights.filter(
      (h) => !usedHighlights.has(h) && distance(pupil.cx, pupil.cy, h.cx, h.cy) < HIGHLIGHT_PROXIMITY
    );

    // Mark these highlights as used
    nearbyHighlights.forEach((h) => usedHighlights.add(h));

    groups.push({
      pupil,
      highlights: nearbyHighlights,
      side: pupil.cx < midX ? 'left' : 'right',
    });
  }

  return groups;
}

// ─── SVG Transformation ───────────────────────────────────────────────────────

/**
 * Add eye animation capability to SVG content.
 *
 * This function:
 * 1. Finds pupil and highlight elements by parsing the SVG
 * 2. Groups them by proximity (not by order in SVG)
 * 3. Wraps each element in a <g> group with animation classes
 *
 * The actual animation is controlled by CSS or JavaScript.
 *
 * @param svgText - The raw SVG string
 * @returns Modified SVG string with animation groups
 */
export function addEyeAnimation(svgText: string): string {
  const elements = parseElements(svgText);
  const eyeGroups = groupEyeElements(elements);

  if (eyeGroups.length === 0) return svgText;

  // Collect all elements to wrap and sort by index (descending) to replace from end
  interface WrapInfo {
    element: ElementInfo;
    side: 'left' | 'right';
  }

  const toWrap: WrapInfo[] = [];

  for (const group of eyeGroups) {
    toWrap.push({ element: group.pupil, side: group.side });
    for (const highlight of group.highlights) {
      toWrap.push({ element: highlight, side: group.side });
    }
  }

  // Sort by index descending to replace from end to start
  toWrap.sort((a, b) => b.element.index - a.element.index);

  let result = svgText;

  // Wrap each element individually
  for (const { element, side } of toWrap) {
    const wrapper = `<g class="blobbi-eye blobbi-eye-${side}" style="transform-box: fill-box; transform-origin: center;">${element.match}</g>`;
    result = result.slice(0, element.index) + wrapper + result.slice(element.endIndex);
  }

  return result;
}

/**
 * Check if eye animation should be applied based on state
 */
export function shouldAnimateEyes(isSleeping: boolean): boolean {
  return !isSleeping;
}
