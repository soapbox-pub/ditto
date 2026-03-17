/**
 * Eye Animation Utility
 * 
 * Transforms SVG content to add subtle eye movement animations.
 * Wraps pupil and highlight elements in animated groups while keeping
 * the eye white background static.
 * 
 * Pattern detection:
 * - Eye white: Elements with gradient IDs containing "Eye" but not "Pupil"
 * - Pupil: Elements with gradient IDs containing "Pupil" or dark fills (#1f2937, #374151, etc.)
 * - Highlights: Small white circles/ellipses that follow pupils
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface _EyeElements {
  /** Index where the eye's pupil starts in the elements array */
  pupilStartIndex: number;
  /** Index where the eye's highlights end */
  highlightEndIndex: number;
  /** X coordinate of the eye center (for grouping left/right eyes) */
  eyeCenterX: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Dark colors typically used for pupils
const PUPIL_COLORS = ['#1f2937', '#374151', '#1e293b', '#111827'];

// Gradient ID patterns for pupils
const PUPIL_GRADIENT_PATTERNS = [
  /Pupil/i,
  /blobbiPupilGradient/i,
];

// Patterns to identify eye white backgrounds (should NOT be animated)
const EYE_WHITE_PATTERNS = [
  /EyeWhite/i,
  /EyeGradient/i,
  /blobbiEyeGradient/i,
];

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
 * Check if an element is an eye white background (should NOT be animated)
 * Reserved for future use if we need to explicitly skip eye whites.
 */
function _isEyeWhiteElement(element: string): boolean {
  for (const pattern of EYE_WHITE_PATTERNS) {
    if (pattern.test(element)) return true;
  }
  return false;
}

/**
 * Check if an element is a highlight (small white circle/ellipse)
 * These should move with the pupil
 */
function isHighlightElement(element: string): boolean {
  // Must be white or have high opacity white
  const isWhite = element.includes('fill="white"') || 
                  element.includes("fill='white'") ||
                  element.includes('fill="#fff"') ||
                  element.includes('fill="#ffffff"');
  
  if (!isWhite) return false;
  
  // Must be small (radius <= 6 for circles, or small ellipse)
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
 * Extract center X coordinate from an element
 */
function getElementCenterX(element: string): number | null {
  // Check for cx attribute (circles/ellipses)
  const cxMatch = element.match(/cx="(\d+\.?\d*)"/);
  if (cxMatch) {
    return parseFloat(cxMatch[1]);
  }
  return null;
}

// ─── SVG Transformation ───────────────────────────────────────────────────────

/**
 * Add eye movement animation to SVG content.
 * 
 * This function:
 * 1. Finds pupil and highlight elements
 * 2. Groups them by eye (left/right based on x-coordinate)
 * 3. Wraps each eye's movable elements in an animated <g> group
 * 
 * @param svgText - The raw SVG string
 * @param animationClass - CSS class to apply for animation (default: 'animate-eye-movement')
 * @returns Modified SVG string with animation groups
 */
export function addEyeAnimation(
  svgText: string,
  animationClass: string = 'animate-eye-movement'
): string {
  // Split SVG into individual elements for analysis
  // We need to find sequences of: [eye-white] [pupil] [highlights...]
  
  // Find all circle and ellipse elements (potential eye parts)
  const elementRegex = /<(circle|ellipse)[^>]*\/>/g;
  const elements: { match: string; index: number; endIndex: number }[] = [];
  
  let match;
  while ((match = elementRegex.exec(svgText)) !== null) {
    elements.push({
      match: match[0],
      index: match.index,
      endIndex: match.index + match[0].length,
    });
  }
  
  if (elements.length === 0) return svgText;
  
  // Find pupil elements and their following highlights
  const eyeGroups: { startIndex: number; endIndex: number; elements: string[] }[] = [];
  let i = 0;
  
  while (i < elements.length) {
    const el = elements[i];
    
    if (isPupilElement(el.match)) {
      // Found a pupil, collect it and following highlights
      const group = {
        startIndex: el.index,
        endIndex: el.endIndex,
        elements: [el.match],
      };
      
      // Look ahead for highlights that belong to this eye
      const pupilX = getElementCenterX(el.match);
      let j = i + 1;
      
      while (j < elements.length) {
        const nextEl = elements[j];
        const nextX = getElementCenterX(nextEl.match);
        
        // Check if this is a highlight near the same X position (within 10px)
        if (isHighlightElement(nextEl.match) && 
            pupilX !== null && 
            nextX !== null && 
            Math.abs(nextX - pupilX) < 10) {
          group.elements.push(nextEl.match);
          group.endIndex = nextEl.endIndex;
          j++;
        } else {
          break;
        }
      }
      
      eyeGroups.push(group);
      i = j;
    } else {
      i++;
    }
  }
  
  if (eyeGroups.length === 0) return svgText;
  
  // Apply transformations from end to start to preserve indices
  let result = svgText;
  
  // Determine if we have left/right eyes (for alternating animation delays)
  const sortedGroups = [...eyeGroups].sort((a, b) => {
    const aX = getElementCenterX(a.elements[0]) ?? 0;
    const bX = getElementCenterX(b.elements[0]) ?? 0;
    return aX - bX;
  });
  
  // Process from end to preserve string indices
  for (let idx = eyeGroups.length - 1; idx >= 0; idx--) {
    const group = eyeGroups[idx];
    const isLeftEye = sortedGroups.indexOf(group) % 2 === 0;
    
    // Create the animated group wrapper
    const elementsJoined = group.elements.join('\n    ');
    const delayClass = isLeftEye ? 'eye-left' : 'eye-right';
    const wrappedGroup = `<g class="${animationClass} ${delayClass}">\n    ${elementsJoined}\n  </g>`;
    
    // Replace the original elements with the wrapped group
    const before = result.slice(0, group.startIndex);
    const after = result.slice(group.endIndex);
    result = before + wrappedGroup + after;
  }
  
  return result;
}

/**
 * Check if eye animation should be applied based on state
 */
export function shouldAnimateEyes(isSleeping: boolean): boolean {
  return !isSleeping;
}
