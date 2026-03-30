/**
 * Body Effect Generators
 * 
 * Pure functions that generate SVG markup for body-level visual effects.
 * Each generator returns SVG strings — no DOM manipulation.
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
 * Generate dirt marks/scratches on the lower body.
 */
export function generateDirtMarks(config: DirtMarksConfig): string {
  if (!config.enabled) return '';
  
  const count = config.count ?? 3;
  const marks: string[] = [];
  
  const positions = [
    { x: 35, y: 75, angle: 15, length: 4 },
    { x: 55, y: 80, angle: -10, length: 3.5 },
    { x: 45, y: 72, angle: 5, length: 3 },
  ].slice(0, count);
  
  positions.forEach((pos, i) => {
    const startX = pos.x;
    const startY = pos.y;
    const endX = startX + pos.length * Math.cos((pos.angle * Math.PI) / 180);
    const endY = startY + pos.length * Math.sin((pos.angle * Math.PI) / 180);
    const controlX = (startX + endX) / 2 + 1;
    const controlY = (startY + endY) / 2 - 0.5;
    
    marks.push(`<path
      class="blobbi-dirt-mark blobbi-dirt-mark-${i}"
      d="M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}"
      stroke="#78716c"
      stroke-width="1.5"
      stroke-linecap="round"
      fill="none"
      opacity="0.6"
    />`);
  });
  
  return marks.join('\n');
}

// ─── Stink Clouds ─────────────────────────────────────────────────────────────

/**
 * Generate animated stink cloud puffs below the Blobbi.
 */
export function generateStinkClouds(config: StinkCloudsConfig): string {
  if (!config.enabled) return '';
  
  const count = config.count ?? 3;
  const clouds: string[] = [];
  
  const positions = [
    { x: 38, y: 88, delay: 0 },
    { x: 50, y: 90, delay: 0.8 },
    { x: 62, y: 87, delay: 1.6 },
  ].slice(0, count);
  
  positions.forEach((pos, i) => {
    const startX = pos.x;
    const startY = pos.y;
    
    clouds.push(`<g class="blobbi-stink-cloud blobbi-stink-cloud-${i}" opacity="0">
      <path
        d="M ${startX} ${startY} 
           Q ${startX - 1.5} ${startY - 1} ${startX - 2} ${startY - 2}
           Q ${startX - 1} ${startY - 3} ${startX} ${startY - 2.5}
           Q ${startX + 1} ${startY - 3} ${startX + 2} ${startY - 2}
           Q ${startX + 1.5} ${startY - 1} ${startX} ${startY}"
        fill="#9ca3af"
        opacity="0.5"
      />
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -12"
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
