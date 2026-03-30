/**
 * Body Effect Generators
 * 
 * Pure functions that generate SVG markup for body-level visual effects.
 * Each generator returns SVG strings — no DOM manipulation.
 * 
 * Coordinate systems by variant:
 *   - Baby:  100x100 viewBox, body roughly x: 25-75, y: 15-88
 *   - Adult: 200x200 viewBox, body varies significantly by form
 * 
 * For adults, dirt marks use detected body bounds (not hardcoded positions)
 * to correctly follow each form's actual silhouette.
 */

import type {
  DirtMarksConfig,
  StinkCloudsConfig,
  BodyEffectConfig,
  BodyPathInfo,
} from './types';

// ─── Body Path Detection ──────────────────────────────────────────────────────

/**
 * Detect the body path from the SVG and extract full bounding box.
 * Looks for the main body path (body gradient fill or "Body" comment).
 * Returns both X and Y bounds for shape-aware dirt placement.
 */
export function detectBodyPath(svgText: string): BodyPathInfo | null {
  // Strategy 1: path with body gradient fill
  const bodyGradientMatch = svgText.match(/<path[^>]*d="([^"]+)"[^>]*fill="url\(#[^"]*[Bb]ody[^"]*\)"[^>]*\/>/);
  if (bodyGradientMatch) {
    const pathD = bodyGradientMatch[1];
    return { pathD, ...estimatePathBounds(pathD) };
  }
  
  // Strategy 2: path after "Body" comment
  const commentMatch = svgText.match(/<!--[^>]*[Bb]ody[^>]*-->\s*<path[^>]*d="([^"]+)"/);
  if (commentMatch) {
    const pathD = commentMatch[1];
    return { pathD, ...estimatePathBounds(pathD) };
  }
  
  return null;
}

/**
 * Estimate the full bounding box of a path from its d attribute.
 * Extracts both X and Y coordinate ranges for shape-aware placement.
 */
function estimatePathBounds(pathD: string): Omit<BodyPathInfo, 'pathD'> {
  // Parse path commands to extract coordinate pairs
  // This handles M, L, Q, C commands by extracting numbers in sequence
  const numbers = pathD.match(/-?\d+\.?\d*/g)?.map(Number) || [];
  
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  
  // Process numbers as x,y pairs
  for (let i = 0; i < numbers.length - 1; i += 2) {
    const x = numbers[i];
    const y = numbers[i + 1];
    
    if (x !== undefined && !isNaN(x)) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    if (y !== undefined && !isNaN(y)) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  
  // Fallback to sensible defaults if parsing failed
  if (!isFinite(minX) || !isFinite(maxX)) {
    minX = 20;
    maxX = 80;
  }
  if (!isFinite(minY) || !isFinite(maxY)) {
    minY = 10;
    maxY = 90;
  }
  
  const width = maxX - minX;
  const height = maxY - minY;
  const centerX = minX + width / 2;
  
  return { minX, maxX, minY, maxY, centerX, width, height };
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
 *   - Uses fixed positions (body shape is consistent)
 *   - Face region: x: 30-70, y: 35-70 (AVOID)
 *   - Safe lower edges: y > 72, prefer x < 35 or x > 65
 *
 * Adult (variable body shapes):
 *   - Uses detected body bounds for shape-aware placement
 *   - Positions computed relative to actual body silhouette
 *   - Dirt placed at lower 30% of body height, near side edges
 */

/**
 * Dirt mark positions for baby variant (100x100 viewBox).
 * Baby has consistent body shape, so fixed positions work well.
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
 * Compute dirt mark positions relative to detected body bounds.
 * Places marks at lower-left and lower-right edges, avoiding face region.
 * 
 * @param bodyPath - Detected body path with bounds
 * @param count - Number of marks to generate
 * @returns Array of position objects relative to actual body silhouette
 */
function computeAdultDirtPositions(
  bodyPath: BodyPathInfo,
  count: number
): Array<{ x: number; y: number; angle: number; length: number }> {
  const { minX, maxX, minY, centerX, width, height } = bodyPath;
  
  // Safe zone: lower 35% of body height (well below face)
  const safeTopY = minY + height * 0.65;
  
  // Edge margins: 15% inward from body edges
  const leftEdgeX = minX + width * 0.15;
  const rightEdgeX = maxX - width * 0.15;
  
  // Mark length scales with body size
  const markLength = Math.max(3, width * 0.05);
  
  // All possible positions - ordered by priority
  const allPositions = [
    // Primary marks - lower side edges
    { x: leftEdgeX, y: safeTopY + height * 0.08, angle: 25, length: markLength },
    { x: rightEdgeX, y: safeTopY + height * 0.05, angle: -20, length: markLength },
    { x: leftEdgeX + width * 0.05, y: safeTopY + height * 0.18, angle: 15, length: markLength * 0.85 },
    // Additional marks for higher counts
    { x: rightEdgeX - width * 0.05, y: safeTopY + height * 0.15, angle: -15, length: markLength * 0.85 },
    { x: centerX, y: safeTopY + height * 0.22, angle: 5, length: markLength * 0.75 },
  ];
  
  return allPositions.slice(0, count);
}

/**
 * Generate dirt marks/scratches on the body.
 *
 * Placement rules:
 *   - AVOID face region (eyes, mouth, eyebrows, tears, drool, blush, sparkles)
 *   - PREFER lower-left and lower-right edges of body silhouette
 *   - Bottom edge placement is safe (well below face elements)
 *   - Adult uses detected body bounds; baby uses fixed positions
 *
 * @param config - Dirt marks configuration including variant and bodyPath
 * @returns SVG markup for dirt marks
 */
export function generateDirtMarks(config: DirtMarksConfig): string {
  if (!config.enabled) return '';

  const count = config.count ?? 3;
  const variant = config.variant ?? 'adult';
  const marks: string[] = [];

  // Compute positions based on variant
  let positions: Array<{ x: number; y: number; angle: number; length: number }>;
  
  if (variant === 'adult' && config.bodyPath) {
    // Adult with detected body: use shape-aware placement
    positions = computeAdultDirtPositions(config.bodyPath, count);
  } else if (variant === 'baby') {
    // Baby: use fixed positions (consistent body shape)
    positions = BABY_DIRT_POSITIONS.slice(0, count);
  } else {
    // Adult fallback without body detection: use conservative defaults
    // These are positioned relative to typical adult body center
    positions = [
      { x: 78, y: 130, angle: 25, length: 4 },
      { x: 122, y: 128, angle: -20, length: 4 },
      { x: 80, y: 145, angle: 15, length: 3.5 },
      { x: 120, y: 142, angle: -15, length: 3.5 },
      { x: 100, y: 152, angle: 5, length: 3 },
    ].slice(0, count);
  }

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
  // Stronger visibility than back layer
  front: [
    { x: 28, y: 78, r: 1.2, delay: 0.1 },   // lower-left edge
    { x: 70, y: 76, r: 1.1, delay: 0.4 },   // lower-right edge
    { x: 32, y: 84, r: 1.0, delay: 0.7 },   // very low left
  ],
};

/**
 * Compute dust particle positions relative to detected body bounds.
 * Places particles at lower edges, avoiding face region.
 * 
 * @param bodyPath - Detected body path with bounds
 * @returns Object with back and front layer particle positions
 */
function computeAdultDustPositions(bodyPath: BodyPathInfo): {
  back: Array<{ x: number; y: number; r: number; delay: number }>;
  front: Array<{ x: number; y: number; r: number; delay: number }>;
} {
  const { minX, maxX, maxY, centerX, width, height } = bodyPath;
  
  // Back layer: below the body bottom
  const backY = maxY + height * 0.05;
  
  // Front layer: lower 30% of body, at side edges
  const frontTopY = maxY - height * 0.3;
  
  // Edge positions
  const leftEdgeX = minX + width * 0.15;
  const rightEdgeX = maxX - width * 0.15;
  
  // Particle radius scales with body size
  const baseRadius = Math.max(1.5, width * 0.025);
  
  return {
    back: [
      { x: leftEdgeX, y: backY, r: baseRadius, delay: 0 },
      { x: centerX, y: backY + 3, r: baseRadius * 0.85, delay: 0.3 },
      { x: rightEdgeX, y: backY - 2, r: baseRadius * 0.9, delay: 0.6 },
    ],
    front: [
      { x: leftEdgeX - width * 0.05, y: frontTopY + height * 0.08, r: baseRadius * 0.9, delay: 0.1 },
      { x: rightEdgeX + width * 0.05, y: frontTopY + height * 0.05, r: baseRadius * 0.85, delay: 0.4 },
      { x: leftEdgeX, y: frontTopY + height * 0.18, r: baseRadius * 0.75, delay: 0.7 },
    ],
  };
}

/**
 * Generate animated dust particles around the Blobbi.
 * Creates both back-layer (below body) and front-layer (in front of body) particles
 * for a stronger "dirty" visual effect.
 * 
 * Distribution:
 *   - Back layer: underneath/behind the body (lower z-index)
 *   - Front layer: near lower body edges, in front (higher z-index)
 *   - Front dust is more visible (larger, higher opacity)
 *
 * @param config - Dirt marks configuration (reused for dust)
 * @returns SVG markup for dust particles
 */
export function generateDustParticles(config: DirtMarksConfig): string {
  if (!config.enabled) return '';

  const variant = config.variant ?? 'adult';
  const particles: string[] = [];

  // Compute positions based on variant
  let positions: {
    back: Array<{ x: number; y: number; r: number; delay: number }>;
    front: Array<{ x: number; y: number; r: number; delay: number }>;
  };
  
  if (variant === 'adult' && config.bodyPath) {
    // Adult with detected body: use shape-aware placement
    positions = computeAdultDustPositions(config.bodyPath);
  } else if (variant === 'baby') {
    // Baby: use fixed positions
    positions = BABY_DUST_POSITIONS;
  } else {
    // Adult fallback: conservative defaults
    positions = {
      back: [
        { x: 80, y: 175, r: 2.5, delay: 0 },
        { x: 100, y: 180, r: 2.2, delay: 0.3 },
        { x: 120, y: 173, r: 2.3, delay: 0.6 },
      ],
      front: [
        { x: 75, y: 135, r: 2.0, delay: 0.1 },
        { x: 125, y: 132, r: 1.8, delay: 0.4 },
        { x: 78, y: 148, r: 1.6, delay: 0.7 },
      ],
    };
  }

  // Generate back layer particles (underneath body)
  positions.back.forEach((pos, i) => {
    particles.push(`<circle
      class="blobbi-dust-particle blobbi-dust-back-${i}"
      cx="${pos.x.toFixed(1)}"
      cy="${pos.y.toFixed(1)}"
      r="${pos.r.toFixed(1)}"
      fill="#57534e"
      opacity="0.55"
    >
      <animate
        attributeName="opacity"
        values="0.55;0.3;0.55"
        dur="2s"
        begin="${pos.delay}s"
        repeatCount="indefinite"
      />
      <animate
        attributeName="cy"
        values="${pos.y.toFixed(1)};${(pos.y - 2).toFixed(1)};${pos.y.toFixed(1)}"
        dur="2s"
        begin="${pos.delay}s"
        repeatCount="indefinite"
      />
    </circle>`);
  });

  // Generate front layer particles (in front of body, more visible)
  positions.front.forEach((pos, i) => {
    particles.push(`<circle
      class="blobbi-dust-particle blobbi-dust-front-${i}"
      cx="${pos.x.toFixed(1)}"
      cy="${pos.y.toFixed(1)}"
      r="${pos.r.toFixed(1)}"
      fill="#3f3f46"
      opacity="0.75"
    >
      <animate
        attributeName="opacity"
        values="0.75;0.45;0.75"
        dur="2.5s"
        begin="${pos.delay}s"
        repeatCount="indefinite"
      />
      <animate
        attributeName="cy"
        values="${pos.y.toFixed(1)};${(pos.y - 3).toFixed(1)};${pos.y.toFixed(1)}"
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
