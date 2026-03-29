/**
 * Body Effect Generators
 * 
 * Pure functions that generate SVG markup for body-level visual effects.
 * Each generator returns SVG strings — no DOM manipulation, no side effects.
 * 
 * These generators are extracted from the monolithic emotions.ts to be
 * independently usable and composable.
 */

import type { DirtMarksConfig, StinkCloudsConfig, AngerRiseConfig } from './types';

// ─── Dirt Marks ───────────────────────────────────────────────────────────────

/**
 * Generate dirt marks/scratches on the lower body.
 * Creates small curved lines that look like dirt or scratches.
 * 
 * Positions are deterministic (no randomness) for consistent rendering.
 * Marks appear in the lower portion of Blobbi (y: 70-85 for 100x100 viewBox).
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
 * Creates small wavy shapes that float upward to indicate poor hygiene.
 * 
 * Each cloud has:
 * - A wavy path shape (gray)
 * - An upward translate animation (3s cycle)
 * - A fade in/out opacity animation
 * - Staggered delay for natural appearance
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
      <!-- Float up animation -->
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -12"
        dur="3s"
        begin="${pos.delay}s"
        repeatCount="indefinite"
      />
      <!-- Fade in and out -->
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
 * Detect the body path in SVG for body-level effects.
 * Looks for paths with a body-related gradient fill.
 */
export function detectBodyPath(svgText: string): string | null {
  // Look for the body path: a path with a body-gradient fill
  const bodyPathRegex = /<path[^>]*d="([^"]*)"[^>]*fill="url\(#[^"]*[Bb]ody[^"]*\)"[^>]*\/>/;
  const match = svgText.match(bodyPathRegex);
  return match ? match[1] : null;
}

/**
 * Generate an anger-rise effect: a colored overlay that rises inside the body shape.
 * Returns both defs (clip-path + gradient) and the overlay element.
 */
export function generateAngerRise(
  bodyPathD: string,
  config: AngerRiseConfig
): { defs: string; overlay: string } {
  const clipId = 'anger-body-clip';
  const gradId = 'anger-rise-grad';
  
  const defs = `
    <clipPath id="${clipId}">
      <path d="${bodyPathD}" />
    </clipPath>
    <linearGradient id="${gradId}" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="${config.color}" stop-opacity="0.4" />
      <stop offset="100%" stop-color="${config.color}" stop-opacity="0" />
    </linearGradient>`;
  
  const overlay = `
    <g class="blobbi-body-effect blobbi-anger-rise" clip-path="url(#${clipId})">
      <rect x="0" y="0" width="100" height="100" fill="url(#${gradId})">
        <animate
          attributeName="y"
          values="100;30;100"
          dur="${config.duration}s"
          repeatCount="indefinite"
        />
      </rect>
    </g>`;
  
  return { defs, overlay };
}
