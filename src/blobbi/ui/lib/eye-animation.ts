/**
 * Eye Animation Utility
 *
 * Transforms SVG content to add eye animation capability.
 *
 * Two separate animation layers:
 * 1. TRACKING: Wraps pupil + highlight in <g class="blobbi-eye"> for mouse following
 * 2. BLINKING: Wraps entire eye (white + pupil + highlight) in <g class="blobbi-blink"> for blink
 *
 * This separation ensures:
 * - Only pupil/highlight move when tracking mouse
 * - Entire eye closes when blinking
 * - Eye white stays fixed during mouse tracking
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
  type: 'eye-white' | 'pupil' | 'highlight' | 'other';
  /** Approximate radius */
  radius: number;
}

interface FullEyeGroup {
  /** Eye white element (if found) */
  eyeWhite: ElementInfo | null;
  /** Pupil element */
  pupil: ElementInfo;
  /** Highlight elements */
  highlights: ElementInfo[];
  /** Left or right eye */
  side: 'left' | 'right';
  /** Center X (from pupil) */
  centerX: number;
  /** Center Y (from pupil) */
  centerY: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Dark colors used for pupils
const PUPIL_COLORS = ['#1f2937', '#374151', '#1e293b', '#111827', '#0f172a', '#64748b'];

// Max distance for elements to belong to the same eye
const EYE_PROXIMITY = 15;

// ─── Detection Helpers ────────────────────────────────────────────────────────

/**
 * Check if element is an eye white
 */
function isEyeWhiteElement(element: string, radius: number): boolean {
  // Check for eye gradient (e.g., blobbiEyeGradient, cattiEyeWhite3D)
  if (/fill="url\(#[^"]*[Ee]ye[^"]*\)"/.test(element)) {
    return true;
  }

  // Check for plain white with sufficient size (like cloudi)
  const isWhite =
    element.includes('fill="white"') ||
    element.includes("fill='white'") ||
    element.includes('fill="#fff"') ||
    element.includes('fill="#ffffff"') ||
    element.includes('fill="#FFF"') ||
    element.includes('fill="#FFFFFF"');

  if (isWhite && radius >= 5) {
    return true;
  }

  return false;
}

/**
 * Check if element is a pupil
 */
function isPupilElement(element: string): boolean {
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
 * Check if element is a highlight (small white element)
 */
function isHighlightElement(element: string, radius: number): boolean {
  const isWhite =
    element.includes('fill="white"') ||
    element.includes("fill='white'") ||
    element.includes('fill="#fff"') ||
    element.includes('fill="#ffffff"') ||
    element.includes('fill="#FFF"') ||
    element.includes('fill="#FFFFFF"');

  return isWhite && radius <= 4;
}

/**
 * Extract center coordinates and radius from element
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

/**
 * Calculate distance between two points
 */
function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// ─── SVG Parsing ──────────────────────────────────────────────────────────────

/**
 * Parse SVG and extract all circle/ellipse elements
 */
function parseElements(svgText: string): ElementInfo[] {
  const elementRegex = /<(circle|ellipse)[^>]*\/>/g;
  const elements: ElementInfo[] = [];

  let match;
  while ((match = elementRegex.exec(svgText)) !== null) {
    const geometry = getElementGeometry(match[0]);
    if (!geometry) continue;

    let type: ElementInfo['type'] = 'other';

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
 * Group elements into complete eyes based on proximity to pupils
 */
function groupFullEyes(elements: ElementInfo[]): FullEyeGroup[] {
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

  const groups: FullEyeGroup[] = [];
  const usedEyeWhites = new Set<ElementInfo>();
  const usedHighlights = new Set<ElementInfo>();

  for (const pupil of pupils) {
    // Find closest eye white to this pupil
    let closestEyeWhite: ElementInfo | null = null;
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

    groups.push({
      eyeWhite: closestEyeWhite,
      pupil,
      highlights: nearbyHighlights,
      side: pupil.cx < midX ? 'left' : 'right',
      centerX: pupil.cx,
      centerY: pupil.cy,
    });
  }

  return groups;
}

// ─── SVG Transformation ───────────────────────────────────────────────────────

/**
 * Add eye animation capability to SVG content.
 *
 * Creates two nested groups per eye:
 * 1. Outer group (blobbi-blink): wraps entire eye for blink animation (scaleY)
 * 2. Inner group (blobbi-eye): wraps only pupil+highlight for mouse tracking (translate)
 *
 * Structure:
 * <g class="blobbi-blink blobbi-blink-left">  <!-- blink: scaleY -->
 *   <ellipse ... />  <!-- eye white - NOT tracked -->
 *   <g class="blobbi-eye blobbi-eye-left">  <!-- tracking: translate -->
 *     <circle ... />  <!-- pupil -->
 *     <circle ... />  <!-- highlight -->
 *   </g>
 * </g>
 */
export function addEyeAnimation(svgText: string): string {
  const elements = parseElements(svgText);
  const eyeGroups = groupFullEyes(elements);

  if (eyeGroups.length === 0) return svgText;

  // Collect all operations needed
  interface Operation {
    type: 'replace' | 'remove';
    index: number;
    endIndex: number;
    replacement?: string;
  }

  const operations: Operation[] = [];

  for (const group of eyeGroups) {
    // Collect all elements for this eye (for removal tracking)
    const allElements: ElementInfo[] = [group.pupil, ...group.highlights];
    if (group.eyeWhite) {
      allElements.push(group.eyeWhite);
    }

    // Sort by index to find the first element position
    const sorted = [...allElements].sort((a, b) => a.index - b.index);
    if (sorted.length === 0) continue;

    const first = sorted[0];

    // Build the tracking group content (pupil + highlights only)
    const trackingElements = [group.pupil, ...group.highlights].sort((a, b) => a.index - b.index);
    const trackingContent = trackingElements.map((el) => el.match).join('\n      ');

    // Build the inner tracking group
    const trackingGroup = `<g class="blobbi-eye blobbi-eye-${group.side}" style="transform-box: fill-box; transform-origin: center;">
      ${trackingContent}
    </g>`;

    // Build the outer blink group
    let blinkContent: string;
    if (group.eyeWhite) {
      // Eye white goes outside tracking group, inside blink group
      blinkContent = `${group.eyeWhite.match}
    ${trackingGroup}`;
    } else {
      // No eye white found, just wrap tracking group
      blinkContent = trackingGroup;
    }

    const blinkGroup = `<g class="blobbi-blink blobbi-blink-${group.side}" style="transform-box: fill-box; transform-origin: ${group.centerX}px ${group.centerY}px;">
    ${blinkContent}
  </g>`;

    // First element gets replaced with the full structure
    operations.push({
      type: 'replace',
      index: first.index,
      endIndex: first.endIndex,
      replacement: blinkGroup,
    });

    // Remaining elements get removed
    for (let i = 1; i < sorted.length; i++) {
      operations.push({
        type: 'remove',
        index: sorted[i].index,
        endIndex: sorted[i].endIndex,
      });
    }
  }

  // Sort operations by index descending (process from end to maintain indices)
  operations.sort((a, b) => b.index - a.index);

  let result = svgText;

  for (const op of operations) {
    if (op.type === 'replace' && op.replacement) {
      result = result.slice(0, op.index) + op.replacement + result.slice(op.endIndex);
    } else if (op.type === 'remove') {
      result = result.slice(0, op.index) + result.slice(op.endIndex);
    }
  }

  return result;
}

/**
 * Check if eye animation should be applied based on state
 */
export function shouldAnimateEyes(isSleeping: boolean): boolean {
  return !isSleeping;
}
