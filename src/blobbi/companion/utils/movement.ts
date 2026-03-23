/**
 * Movement Utilities
 * 
 * Helper functions for companion movement and positioning.
 */

import type { Position, MovementBounds, CompanionConfig } from '../types/companion.types';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';

/**
 * Calculate the movement bounds based on viewport size and config.
 */
export function calculateMovementBounds(
  viewportWidth: number,
  viewportHeight: number,
  companionSize: number,
  config: CompanionConfig = DEFAULT_COMPANION_CONFIG
): MovementBounds {
  return {
    minX: config.padding.left,
    maxX: viewportWidth - config.padding.right - companionSize,
    minY: 0,
    maxY: viewportHeight - config.padding.bottom - companionSize,
  };
}

/**
 * Calculate the ground Y position (bottom of movement area).
 */
export function calculateGroundY(
  viewportHeight: number,
  companionSize: number,
  config: CompanionConfig = DEFAULT_COMPANION_CONFIG
): number {
  return viewportHeight - config.padding.bottom - companionSize;
}

/**
 * Calculate the entry position (behind the sidebar).
 * The companion starts just behind the sidebar's left edge,
 * so it appears to emerge from behind the sidebar.
 */
export function calculateEntryPosition(
  viewportHeight: number,
  companionSize: number,
  config: CompanionConfig = DEFAULT_COMPANION_CONFIG
): Position {
  const groundY = calculateGroundY(viewportHeight, companionSize, config);
  return {
    // Start just behind the sidebar (partially hidden)
    // padding.left is the sidebar width, so start at half that minus the companion size
    x: (config.padding.left / 2) - companionSize,
    y: groundY,
  };
}

/**
 * Calculate the initial resting position after entry animation.
 */
export function calculateRestingPosition(
  viewportWidth: number,
  viewportHeight: number,
  companionSize: number,
  config: CompanionConfig = DEFAULT_COMPANION_CONFIG
): Position {
  const groundY = calculateGroundY(viewportHeight, companionSize, config);
  return {
    x: config.padding.left + 20, // Just past the sidebar
    y: groundY,
  };
}

/**
 * Lerp (linear interpolation) between two values.
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Ease out cubic - decelerating curve.
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Ease in out cubic - smooth acceleration and deceleration.
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Calculate distance between two points.
 */
export function distance(a: Position, b: Position): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
