/**
 * Eye Animation Utility
 *
 * Transforms SVG content to add eye animation capability.
 *
 * Three layers per eye:
 * 1. EYELID BACK: Ellipse behind eye white, matches eye white shape, darker body color
 * 2. TRACKING: Wraps pupil + highlight in <g class="blobbi-eye"> for mouse following
 * 3. BLINKING: Wraps entire eye (white + pupil + highlight) in <g class="blobbi-blink"> for blink
 *
 * This separation ensures:
 * - Eyelid back is visible when eyes close (via blink scaleY)
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
  /** Blink center X - from eye white if available, otherwise from pupil */
  blinkCenterX: number;
  /** Blink center Y - from eye white if available, otherwise from pupil */
  blinkCenterY: number;
  /** Eye white geometry for eyelid generation (rx, ry for ellipse) */
  eyeWhiteGeometry: { rx: number; ry: number } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Dark colors used for pupils
// These are the solid fill colors used in adult Blobbi SVGs for pupils
// - #1f2937, #374151, #1e293b, #111827, #0f172a: Dark gray/slate colors (most forms)
// - #64748b: Slate color (cloudi)
// - #1e1b4b: Dark indigo (starri, crysti)
// - #0891b2: Cyan (droppi)
const PUPIL_COLORS = ['#1f2937', '#374151', '#1e293b', '#111827', '#0f172a', '#64748b', '#1e1b4b', '#0891b2'];

// Default eyelid color (used when no base color is provided)
const DEFAULT_EYELID_COLOR = '#6d28d9';

// Max distance for elements to belong to the same eye
const EYE_PROXIMITY = 15;

// How much to darken the base color for eyelids (0-100)
// Keep it subtle so it reads as an eyelid, not a shadow
const EYELID_DARKEN_AMOUNT = 8;

// ─── Color Helpers ────────────────────────────────────────────────────────────

/**
 * Darken a hex color by a percentage
 */
function darkenColor(color: string, percent: number): string {
  if (!color.startsWith('#')) return color;
  
  const num = parseInt(color.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, (num >> 16) - amt);
  const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
  const B = Math.max(0, (num & 0x0000FF) - amt);
  
  return '#' + (
    0x1000000 +
    R * 0x10000 +
    G * 0x100 +
    B
  ).toString(16).slice(1).toUpperCase();
}

// ─── Detection Helpers ────────────────────────────────────────────────────────

/**
 * Check if element is an eye white
 * 
 * IMPORTANT: We must distinguish between:
 * - EyeWhite gradients (actual white part of eye) - INCLUDE
 * - EyeBase gradients (colored eye rim, e.g., froggi's green bulge) - EXCLUDE
 * - Eye gradients without "Base" (generic eye white) - INCLUDE
 * - Plain white fills are ONLY eye whites if they're large (radius >= 8)
 *   Smaller white fills (5-7) are likely highlights, not eye whites
 */
function isEyeWhiteElement(element: string, radius: number): boolean {
  // Extract the gradient ID from the fill attribute
  const gradientMatch = element.match(/fill="url\(#([^"]+)\)"/);
  
  if (gradientMatch) {
    const gradientId = gradientMatch[1];
    
    // EXCLUDE: EyeBase patterns (e.g., froggiEyeBase3D) - these are colored eye rims, not the white part
    if (/[Ee]ye[Bb]ase/i.test(gradientId)) {
      return false;
    }
    
    // INCLUDE: EyeWhite patterns (e.g., cattiEyeWhite3D, froggiEyeWhite3D)
    if (/[Ee]ye[Ww]hite/i.test(gradientId)) {
      return true;
    }
    
    // INCLUDE: Generic Eye gradients without "Base" (e.g., blobbiEyeGradient, crystiEye)
    // This catches baby Blobbi and other forms that use simple "Eye" naming
    if (/[Ee]ye/i.test(gradientId) && !/[Bb]ase/i.test(gradientId)) {
      return true;
    }
  }

  // Check for plain white fills - must be LARGE to be an eye white
  // Adults use r=8-12 for eye whites, r=2-6 for highlights
  // Use radius >= 8 threshold to avoid catching highlights as eye whites
  const isWhite =
    element.includes('fill="white"') ||
    element.includes("fill='white'") ||
    element.includes('fill="#fff"') ||
    element.includes('fill="#ffffff"') ||
    element.includes('fill="#FFF"') ||
    element.includes('fill="#FFFFFF"');

  if (isWhite && radius >= 8) {
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
 * Check if element is a highlight (white element, typically small)
 * 
 * Highlights are the white reflective spots on the pupil.
 * They're white fills that are smaller than eye whites.
 * Adults use r=2-6 for highlights, r=8+ for eye whites.
 */
function isHighlightElement(element: string, radius: number): boolean {
  const isWhite =
    element.includes('fill="white"') ||
    element.includes("fill='white'") ||
    element.includes('fill="#fff"') ||
    element.includes('fill="#ffffff"') ||
    element.includes('fill="#FFF"') ||
    element.includes('fill="#FFFFFF"');

  // Highlights are white fills with radius < 8 (the eye white threshold)
  // This captures adult highlights at r=2-6 and baby highlights at r=2
  return isWhite && radius < 8;
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

    // Use eye white center for blink anchor (more accurate), fallback to pupil
    const blinkAnchor = closestEyeWhite || pupil;

    // Extract eye white geometry (rx, ry) for eyelid generation
    let eyeWhiteGeometry: { rx: number; ry: number } | null = null;
    if (closestEyeWhite) {
      const rxMatch = closestEyeWhite.match.match(/rx="(\d+\.?\d*)"/);
      const ryMatch = closestEyeWhite.match.match(/ry="(\d+\.?\d*)"/);
      const rMatch = closestEyeWhite.match.match(/\br="(\d+\.?\d*)"/);
      
      if (rxMatch && ryMatch) {
        // Ellipse: use rx and ry
        eyeWhiteGeometry = { rx: parseFloat(rxMatch[1]), ry: parseFloat(ryMatch[1]) };
      } else if (rMatch) {
        // Circle: use r for both
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

// ─── Eyelid Generation ────────────────────────────────────────────────────────

/**
 * Generate an eyelid background ellipse that matches the eye white shape.
 * This sits behind the eye and becomes visible when the eye closes (blink).
 */
function generateEyelidElement(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  side: 'left' | 'right',
  color: string
): string {
  return `<ellipse 
      class="blobbi-eyelid blobbi-eyelid-${side}"
      cx="${cx}" 
      cy="${cy}" 
      rx="${rx}" 
      ry="${ry}"
      fill="${color}"
    />`;
}

// ─── SVG Transformation ───────────────────────────────────────────────────────

/**
 * Options for eye animation
 */
export interface EyeAnimationOptions {
  /** Base body color for deriving eyelid color (optional) */
  baseColor?: string;
  /** Unique instance ID to prevent clipPath ID collisions when multiple Blobbis are rendered */
  instanceId?: string;
}

/**
 * Add eye animation capability to SVG content.
 *
 * Creates layers per eye:
 * 1. Eyelid back (blobbi-eyelid): ellipse behind eye, darker body color
 * 2. Outer group (blobbi-blink): wraps eye white + tracking group for blink animation (scaleY)
 * 3. Inner group (blobbi-eye): wraps only pupil+highlight for mouse tracking (translate)
 *
 * Structure:
 * <ellipse class="blobbi-eyelid" ... />  <!-- eyelid back - behind everything -->
 * <g class="blobbi-blink blobbi-blink-left">  <!-- blink: scaleY -->
 *   <ellipse ... />  <!-- eye white - NOT tracked -->
 *   <g class="blobbi-eye blobbi-eye-left">  <!-- tracking: translate -->
 *     <circle ... />  <!-- pupil -->
 *     <circle ... />  <!-- highlight -->
 *   </g>
 * </g>
 */
export function addEyeAnimation(svgText: string, options?: EyeAnimationOptions): string {
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
  const clipPathDefs: string[] = [];

  // Derive eyelid color from base color (or use default)
  const baseColor = options?.baseColor || DEFAULT_EYELID_COLOR;
  const eyelidColor = darkenColor(baseColor, EYELID_DARKEN_AMOUNT);
  
  // Generate unique ID prefix for clipPaths to avoid collisions between multiple Blobbis
  const instanceId = options?.instanceId || Math.random().toString(36).substring(2, 8);

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

    // Calculate eye bounds for clip-path blink animation
    // The clip-path will crop the eye from top to bottom to simulate eyelid closing
    const eyeGeom = group.eyeWhiteGeometry;
    const eyeTop = eyeGeom ? group.blinkCenterY - eyeGeom.ry : group.blinkCenterY - group.pupil.radius;
    const eyeBottom = eyeGeom ? group.blinkCenterY + eyeGeom.ry : group.blinkCenterY + group.pupil.radius;
    const eyeLeft = eyeGeom ? group.blinkCenterX - eyeGeom.rx : group.blinkCenterX - group.pupil.radius;
    const eyeRight = eyeGeom ? group.blinkCenterX + eyeGeom.rx : group.blinkCenterX + group.pupil.radius;
    const eyeHeight = eyeBottom - eyeTop;
    const eyeWidth = eyeRight - eyeLeft;
    
    // Add some padding to the clip rect to ensure nothing gets cut off unexpectedly
    const clipPadding = 2;
    const clipTop = eyeTop - clipPadding;
    const clipLeft = eyeLeft - clipPadding;
    const clipWidth = eyeWidth + clipPadding * 2;
    const clipHeight = eyeHeight + clipPadding * 2;

    // Store eye geometry as data attributes for the animation loop
    // data-eye-top/bottom define the clipping bounds for blink animation
    // data-clip-id references the clipPath element
    const clipId = `blobbi-blink-clip-${instanceId}-${group.side}`;
    const blinkGroup = `<g class="blobbi-blink blobbi-blink-${group.side}" data-cx="${group.blinkCenterX}" data-cy="${group.blinkCenterY}" data-eye-top="${clipTop}" data-eye-bottom="${eyeBottom + clipPadding}" data-clip-height="${clipHeight}" data-clip-id="${clipId}" clip-path="url(#${clipId})">
    ${blinkContent}
  </g>`;

    // Generate eyelid element (behind the eye) if we have geometry
    let fullReplacement = blinkGroup;
    if (group.eyeWhiteGeometry && group.eyeWhite) {
      const eyelidElement = generateEyelidElement(
        group.blinkCenterX,
        group.blinkCenterY,
        group.eyeWhiteGeometry.rx,
        group.eyeWhiteGeometry.ry,
        group.side,
        eyelidColor
      );
      // Eyelid goes BEFORE the blink group (so it's behind)
      fullReplacement = eyelidElement + '\n  ' + blinkGroup;
    }
    
    // Generate clipPath definition for this eye
    // The rect starts at full height and will be animated to shrink from top
    const clipPathDef = `<clipPath id="${clipId}">
      <rect class="blobbi-blink-clip-rect" x="${clipLeft}" y="${clipTop}" width="${clipWidth}" height="${clipHeight}" />
    </clipPath>`;
    
    // Store clipPath to add to defs later
    clipPathDefs.push(clipPathDef);

    // First element gets replaced with the full structure (eyelid + blink group)
    operations.push({
      type: 'replace',
      index: first.index,
      endIndex: first.endIndex,
      replacement: fullReplacement,
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
  
  // Add clipPath definitions to SVG defs
  if (clipPathDefs.length > 0) {
    const defsContent = clipPathDefs.join('\n    ');
    if (result.includes('<defs>')) {
      result = result.replace('<defs>', `<defs>\n    ${defsContent}`);
    } else {
      result = result.replace(/(<svg[^>]*>)/, `$1\n  <defs>\n    ${defsContent}\n  </defs>`);
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
