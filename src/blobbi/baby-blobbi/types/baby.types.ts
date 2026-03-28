/**
 * Baby Blobbi Module Types
 * 
 * Type definitions for baby stage visuals and customization
 */

import { Blobbi } from '@/types/blobbi';

/**
 * Baby visual variant types
 */
export type BabyVariant = 'base' | 'sleeping';

/**
 * Baby SVG customization options
 */
export interface BabySvgCustomization {
  /** Base body color */
  baseColor?: string;
  /** Secondary body color (for gradient) */
  secondaryColor?: string;
  /** Eye/pupil color */
  eyeColor?: string;
}

/**
 * Baby SVG resolver options
 */
export interface BabySvgResolverOptions {
  /** Whether the baby is sleeping */
  isSleeping?: boolean;
  /** Apply color customizations */
  applyColors?: boolean;
}

/**
 * Extracts baby-specific customization from a Blobbi
 */
export function extractBabyCustomization(blobbi: Blobbi): BabySvgCustomization {
  return {
    baseColor: blobbi.baseColor,
    secondaryColor: blobbi.secondaryColor,
    eyeColor: blobbi.eyeColor,
  };
}
