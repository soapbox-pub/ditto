/**
 * SVG Utilities for Blobbi Visual System
 *
 * Centralized exports for all SVG manipulation utilities.
 *
 * This module provides:
 * - Color manipulation (lighten/darken)
 * - ID uniquification (prevent gradient collisions)
 * - Container sizing adjustments
 */

export { lightenColor, darkenColor } from './colors';
export { uniquifySvgIds } from './ids';
export { ensureSvgFillsContainer } from './container';
