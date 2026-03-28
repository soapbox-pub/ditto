/**
 * Baby Blobbi SVG Resolver
 * 
 * Handles loading and resolving baby stage SVG assets
 */

import { Blobbi } from '@/types/blobbi';
import { BabyVariant, BabySvgResolverOptions } from '../types/baby.types';

// Baby stage SVG imports (Vite will handle these)
const BABY_BASE_SVG = import.meta.glob('/src/blobbi/baby-blobbi/assets/blobbi-baby-base.svg', { 
  query: '?raw', 
  import: 'default', 
  eager: true 
});

const BABY_SLEEPING_SVG = import.meta.glob('/src/blobbi/baby-blobbi/assets/blobbi-baby-sleeping.svg', { 
  query: '?raw', 
  import: 'default', 
  eager: true 
});

/**
 * Get baby base SVG content
 */
export function getBabyBaseSvg(): string {
  const svgKey = Object.keys(BABY_BASE_SVG)[0];
  const svgContent = BABY_BASE_SVG[svgKey];
  return typeof svgContent === 'string' ? svgContent : getFallbackBabySvg();
}

/**
 * Get baby sleeping SVG content
 */
export function getBabySleepingSvg(): string {
  const svgKey = Object.keys(BABY_SLEEPING_SVG)[0];
  const svgContent = BABY_SLEEPING_SVG[svgKey];
  return typeof svgContent === 'string' ? svgContent : getFallbackBabySvg();
}

/**
 * Get baby SVG by variant
 */
export function getBabySvgByVariant(variant: BabyVariant): string {
  return variant === 'sleeping' ? getBabySleepingSvg() : getBabyBaseSvg();
}

/**
 * Resolve baby Blobbi SVG content
 */
export function resolveBabySvg(blobbi: Blobbi, options: BabySvgResolverOptions = {}): string {
  const { isSleeping = false } = options;
  
  if (blobbi.lifeStage !== 'baby') {
    console.warn('resolveBabySvg called with non-baby Blobbi');
    return getFallbackBabySvg();
  }
  
  return isSleeping ? getBabySleepingSvg() : getBabyBaseSvg();
}

/**
 * Preload baby SVGs for quick switching
 */
export function preloadBabySvgs(): void {
  // Both SVGs are already loaded eagerly via import.meta.glob
  // This function exists for API consistency
  getBabyBaseSvg();
  getBabySleepingSvg();
}

/**
 * Get fallback baby SVG content
 */
function getFallbackBabySvg(): string {
  return `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="fallbackBodyGradient" cx="0.3" cy="0.25">
          <stop offset="0%" style="stop-color:#8b5cf6"/>
          <stop offset="60%" style="stop-color:#7c3aed"/>
          <stop offset="100%" style="stop-color:#6d28d9"/>
        </radialGradient>
      </defs>
      <path d="M 50 15 Q 50 10 50 15 Q 72 25 75 55 Q 75 80 50 88 Q 25 80 25 55 Q 28 25 50 15"
            fill="url(#fallbackBodyGradient)" />
      <ellipse cx="50" cy="45" rx="15" ry="20" fill="white" opacity="0.2" />
      <ellipse cx="38" cy="45" rx="8" ry="10" fill="#fff" />
      <ellipse cx="62" cy="45" rx="8" ry="10" fill="#fff" />
      <circle cx="38" cy="46" r="6" fill="#374151" />
      <circle cx="62" cy="46" r="6" fill="#374151" />
      <circle cx="40" cy="44" r="2" fill="white" />
      <circle cx="64" cy="44" r="2" fill="white" />
      <path d="M 42 62 Q 50 68 58 62" stroke="#374151" stroke-width="2.5" fill="none" stroke-linecap="round" />
    </svg>
  `;
}
