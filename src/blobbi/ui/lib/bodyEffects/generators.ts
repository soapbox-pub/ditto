/**
 * Body Effect Generators
 * 
 * Pure functions that generate SVG markup for body-level visual effects.
 * Each generator returns SVG strings — no DOM manipulation.
 * 
 * Coordinate systems by variant:
 *   - Baby:  100x100 viewBox, body roughly x: 25-75, y: 15-88
 *   - Adult: 200x200 viewBox, body varies by form but center ~100, width ~70
 */

import type {
  DirtMarksConfig,
  StinkCloudsConfig,
  BodyEffectConfig,
  BodyPathInfo,
} from './types';

// ─── Body Path Detection ──────────────────────────────────────────────────────

/**
 * Detect the body path from the SVG.
 * Looks for the main body path (body gradient fill or "Body" comment).
 */
export function detectBodyPath(svgText: string): BodyPathInfo | null {
  // Strategy 1: path with body gradient fill
  const bodyGradientMatch = svgText.match(/<path[^>]*d="([^"]+)"[^>]*fill="url\(#[^"]*[Bb]ody[^"]*\)"[^>]*\/>/);
  if (bodyGradientMatch) {
    const pathD = bodyGradientMatch[1];
    const bounds = estimatePathBounds(pathD);
    return { pathD, ...bounds };
  }
  
  // Strategy 2: path after "Body" comment
  const commentMatch = svgText.match(/<!--[^>]*[Bb]ody[^>]*-->\s*<path[^>]*d="([^"]+)"/);
  if (commentMatch) {
    const pathD = commentMatch[1];
    const bounds = estimatePathBounds(pathD);
    return { pathD, ...bounds };
  }
  
  return null;
}

/**
 * Estimate the bounding box of a path from its d attribute.
 */
function estimatePathBounds(pathD: string): { minY: number; maxY: number } {
  const numbers = pathD.match(/-?\d+\.?\d*/g)?.map(Number) || [];
  
  let minY = 100;
  let maxY = 0;
  
  for (let i = 1; i < numbers.length; i += 2) {
    const y = numbers[i];
    if (y !== undefined && y >= 5 && y <= 100) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  
  if (minY >= maxY) {
    minY = 10;
    maxY = 90;
  }
  
  return { minY, maxY };
}

// ─── Dirt Marks ───────────────────────────────────────────────────────────────

/**
 * Protected facial zones (where dirt marks should NEVER appear):
 *   - Eyes, mouth, eyebrows
 *   - Tears, saliva/drool, blush marks
 *   - Sparkles and other facial extras
 *   - Upper-center body area where face elements live
 *
 * Preferred dirt placement zones:
 *   - Lower-left edge of body silhouette
 *   - Lower-right edge of body silhouette
 *   - Bottom edge (below face region)
 *   - Side contours in lower half of body
 *
 * Baby (100x100 viewBox):
 *   - Face region: x: 30-70, y: 35-70 (AVOID)
 *   - Safe lower edges: y > 72, prefer x < 35 or x > 65
 *
 * Adult (200x200 viewBox):
 *   - Face region: x: 80-120, y: 70-115 (AVOID)
 *   - Safe lower edges: y > 120, prefer x < 85 or x > 115
 */

/**
 * Dirt mark positions for baby variant (100x100 viewBox).
 * Positioned at lower-left and lower-right edges, avoiding face region.
 */
const BABY_DIRT_POSITIONS = [
  // Primary marks - lower side edges, well below face
  { x: 30, y: 76, angle: 25, length: 2.5 },   // lower-left edge
  { x: 68, y: 74, angle: -20, length: 2.5 },  // lower-right edge
  { x: 32, y: 82, angle: 15, length: 2 },     // very low left
  // Additional marks for higher counts - still at edges
  { x: 66, y: 80, angle: -15, length: 2 },    // very low right
  { x: 50, y: 84, angle: 5, length: 2 },      // bottom center (safe - well below face)
];

/**
 * Dirt mark positions for adult variant (200x200 viewBox).
 * Positioned at lower side edges, avoiding face region entirely.
 */
const ADULT_DIRT_POSITIONS = [
  // Primary marks - lower side edges
  { x: 78, y: 125, angle: 30, length: 4 },    // lower-left side
  { x: 122, y: 122, angle: -25, length: 4 },  // lower-right side
  { x: 80, y: 138, angle: 20, length: 3.5 },  // very low left
  // Additional marks for higher counts
  { x: 120, y: 135, angle: -20, length: 3.5 }, // very low right
  { x: 100, y: 145, angle: 5, length: 3 },    // bottom center (safe - well below face)
];

/**
 * Generate dirt marks/scratches on the body.
 *
 * Placement rules:
 *   - AVOID face region (eyes, mouth, eyebrows, tears, drool, blush, sparkles)
 *   - PREFER lower-left and lower-right edges of body silhouette
 *   - Bottom edge placement is safe (well below face elements)
 *
 * @param config - Dirt marks configuration including variant
 * @returns SVG markup for dirt marks
 */
export function generateDirtMarks(config: DirtMarksConfig): string {
  if (!config.enabled) return '';

  const count = config.count ?? 3;
  const variant = config.variant ?? 'adult';
  const marks: string[] = [];

  // Select positions based on variant
  const basePositions = variant === 'baby' ? BABY_DIRT_POSITIONS : ADULT_DIRT_POSITIONS;
  const positions = basePositions.slice(0, count);

  // Scale factors for stroke width based on viewBox
  const strokeWidth = variant === 'baby' ? 1.3 : 2;

  positions.forEach((pos, i) => {
    const startX = pos.x;
    const startY = pos.y;
    const endX = startX + pos.length * Math.cos((pos.angle * Math.PI) / 180);
    const endY = startY + pos.length * Math.sin((pos.angle * Math.PI) / 180);
    const controlX = (startX + endX) / 2 + (variant === 'baby' ? 0.8 : 1.5);
    const controlY = (startY + endY) / 2 - (variant === 'baby' ? 0.3 : 0.5);

    marks.push(`<path
      class="blobbi-dirt-mark blobbi-dirt-mark-${i}"
      d="M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}"
      stroke="#78716c"
      stroke-width="${strokeWidth}"
      stroke-linecap="round"
      fill="none"
      opacity="0.55"
    />`);
  });

  return marks.join('\n');
}

// ─── Dust Particles ───────────────────────────────────────────────────────────

/**
 * Dust particle positions for baby variant (100x100 viewBox).
 * All particles positioned at lower edges, avoiding face region.
 */
const BABY_DUST_POSITIONS = {
  // Back layer - below the body
  back: [
    { x: 35, y: 90, r: 1.5, delay: 0 },
    { x: 50, y: 92, r: 1.2, delay: 0.3 },
    { x: 65, y: 89, r: 1.3, delay: 0.6 },
  ],
  // Front layer - at lower side edges, NOT in face region
  front: [
    { x: 28, y: 78, r: 1.0, delay: 0.1 },   // lower-left edge
    { x: 70, y: 76, r: 0.9, delay: 0.4 },   // lower-right edge
    { x: 32, y: 84, r: 0.8, delay: 0.7 },   // very low left
  ],
};

/**
 * Dust particle positions for adult variant (200x200 viewBox).
 * All particles positioned at lower edges, avoiding face region.
 */
const ADULT_DUST_POSITIONS = {
  // Back layer - below the body
  back: [
    { x: 80, y: 175, r: 2.5, delay: 0 },
    { x: 100, y: 180, r: 2.2, delay: 0.3 },
    { x: 120, y: 173, r: 2.3, delay: 0.6 },
  ],
  // Front layer - at lower side edges, NOT in face region
  front: [
    { x: 75, y: 130, r: 1.8, delay: 0.1 },   // lower-left side
    { x: 125, y: 128, r: 1.6, delay: 0.4 },  // lower-right side
    { x: 78, y: 142, r: 1.4, delay: 0.7 },   // very low left
  ],
};

/**
 * Generate animated dust particles around the Blobbi.
 * Creates both back-layer (below body) and front-layer (in front of body) particles
 * for a stronger "dirty" visual effect.
 *
 * @param config - Dirt marks configuration (reused for dust)
 * @returns SVG markup for dust particles
 */
export function generateDustParticles(config: DirtMarksConfig): string {
  if (!config.enabled) return '';

  const variant = config.variant ?? 'adult';
  const particles: string[] = [];

  const positions = variant === 'baby' ? BABY_DUST_POSITIONS : ADULT_DUST_POSITIONS;

  // Generate back layer particles
  positions.back.forEach((pos, i) => {
    particles.push(`<circle
      class="blobbi-dust-particle blobbi-dust-back-${i}"
      cx="${pos.x}"
      cy="${pos.y}"
      r="${pos.r}"
      fill="#57534e"
      opacity="0.6"
    >
      <animate
        attributeName="opacity"
        values="0.6;0.3;0.6"
        dur="2s"
        begin="${pos.delay}s"
        repeatCount="indefinite"
      />
      <animate
        attributeName="cy"
        values="${pos.y};${pos.y - 2};${pos.y}"
        dur="2s"
        begin="${pos.delay}s"
        repeatCount="indefinite"
      />
    </circle>`);
  });

  // Generate front layer particles with slightly stronger opacity
  positions.front.forEach((pos, i) => {
    particles.push(`<circle
      class="blobbi-dust-particle blobbi-dust-front-${i}"
      cx="${pos.x}"
      cy="${pos.y}"
      r="${pos.r}"
      fill="#44403c"
      opacity="0.7"
    >
      <animate
        attributeName="opacity"
        values="0.7;0.4;0.7"
        dur="2.5s"
        begin="${pos.delay}s"
        repeatCount="indefinite"
      />
      <animate
        attributeName="cy"
        values="${pos.y};${pos.y - 3};${pos.y}"
        dur="2.5s"
        begin="${pos.delay}s"
        repeatCount="indefinite"
      />
    </circle>`);
  });

  return particles.join('\n');
}

// ─── Stink Clouds ─────────────────────────────────────────────────────────────

/**
 * Stink cloud positions for baby variant (100x100 viewBox).
 */
const BABY_STINK_POSITIONS = [
  { x: 44, y: 87, delay: 0 },
  { x: 50, y: 89, delay: 0.8 },
  { x: 56, y: 86, delay: 1.6 },
  { x: 47, y: 88, delay: 2.2 },
];

/**
 * Stink cloud positions for adult variant (200x200 viewBox).
 */
const ADULT_STINK_POSITIONS = [
  { x: 88, y: 175, delay: 0 },
  { x: 100, y: 178, delay: 0.8 },
  { x: 112, y: 173, delay: 1.6 },
  { x: 95, y: 176, delay: 2.2 },
];

/**
 * Generate animated stink cloud puffs below the Blobbi.
 *
 * Positions are centered below the body:
 *   - Baby (100x100): spread around x=50, y: 86-90
 *   - Adult (200x200): spread around x=100, y: 173-178
 *
 * @param config - Stink clouds configuration including variant
 * @returns SVG markup for stink clouds
 */
export function generateStinkClouds(config: StinkCloudsConfig): string {
  if (!config.enabled) return '';

  const count = config.count ?? 3;
  const variant = config.variant ?? 'adult';
  const clouds: string[] = [];

  // Select positions based on variant
  const basePositions = variant === 'baby' ? BABY_STINK_POSITIONS : ADULT_STINK_POSITIONS;
  const positions = basePositions.slice(0, count);
  
  // Scale factors based on viewBox
  const scale = variant === 'baby' ? 1 : 2;
  const floatDistance = variant === 'baby' ? 12 : 24;
  
  positions.forEach((pos, i) => {
    const startX = pos.x;
    const startY = pos.y;
    const s = scale; // shorthand for cleaner path math
    
    clouds.push(`<g class="blobbi-stink-cloud blobbi-stink-cloud-${i}" opacity="0">
      <path
        d="M ${startX} ${startY} 
           Q ${startX - 1.5 * s} ${startY - 1 * s} ${startX - 2 * s} ${startY - 2 * s}
           Q ${startX - 1 * s} ${startY - 3 * s} ${startX} ${startY - 2.5 * s}
           Q ${startX + 1 * s} ${startY - 3 * s} ${startX + 2 * s} ${startY - 2 * s}
           Q ${startX + 1.5 * s} ${startY - 1 * s} ${startX} ${startY}"
        fill="#9ca3af"
        opacity="0.5"
      />
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -${floatDistance}"
        dur="3s"
        begin="${pos.delay}s"
        repeatCount="indefinite"
      />
      <animate
        attributeName="opacity"
        values="0;0.6;0.6;0"
        keyTimes="0;0.15;0.7;1"
        dur="3s"
        begin="${pos.delay}s"
        repeatCount="indefinite"
      />
    </g>`);
  });
  
  return clouds.join('\n');
}

// ─── Anger Rise ───────────────────────────────────────────────────────────────

/**
 * Generate the anger-rise body effect.
 * Creates a colored overlay that animates from bottom to top inside the body shape.
 * 
 * @param bodyPath - Detected body path info
 * @param config - Effect configuration (color, duration)
 * @param idSuffix - Unique suffix for clip/gradient IDs (prevents collisions when multiple Blobbis render)
 */
export function generateAngerRiseEffect(
  bodyPath: BodyPathInfo,
  config: BodyEffectConfig,
  idSuffix?: string,
): { defs: string; overlay: string } {
  const { pathD, minY, maxY } = bodyPath;
  const bodyHeight = maxY - minY;
  
  // Generate unique IDs to avoid collisions when multiple Blobbis are on the same page
  const suffix = idSuffix ?? Math.random().toString(36).slice(2, 8);
  const clipId = `blobbi-anger-clip-${suffix}`;
  const gradientId = `blobbi-anger-gradient-${suffix}`;
  
  const defs = `
    <clipPath id="${clipId}">
      <path d="${pathD}" />
    </clipPath>
    <linearGradient id="${gradientId}" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="${config.color}">
        <animate 
          attributeName="stop-opacity" 
          values="0;0.5;0.5" 
          keyTimes="0;0.5;1"
          dur="${config.duration}s" 
          fill="freeze"
        />
      </stop>
      <stop stop-color="${config.color}">
        <animate 
          attributeName="offset" 
          values="0;1" 
          dur="${config.duration}s" 
          fill="freeze"
        />
        <animate 
          attributeName="stop-opacity" 
          values="0;0.4;0.4" 
          keyTimes="0;0.3;1"
          dur="${config.duration}s" 
          fill="freeze"
        />
      </stop>
      <stop stop-color="${config.color}" stop-opacity="0">
        <animate 
          attributeName="offset" 
          values="0;1" 
          dur="${config.duration}s" 
          fill="freeze"
        />
      </stop>
    </linearGradient>`;
  
  const overlay = `
    <rect 
      class="blobbi-anger-rise"
      x="0" y="${minY}" 
      width="100" height="${bodyHeight}"
      fill="url(#${gradientId})"
      clip-path="url(#${clipId})"
    />`;
  
  return { defs, overlay };
}
