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
 * 
 * This returns the Y position where the companion CONTAINER should be placed.
 * The visual alignment of the Blobbi body within the container is handled
 * separately in BlobbiCompanionVisual via a translateY transform.
 */
export function calculateGroundY(
  viewportHeight: number,
  companionSize: number,
  config: CompanionConfig = DEFAULT_COMPANION_CONFIG
): number {
  return viewportHeight - config.padding.bottom - companionSize;
}

/**
 * Calculate the left edge of the main content area.
 * This accounts for the centered layout and sidebar.
 */
export function calculateMainContentLeftEdge(
  viewportWidth: number,
  config: CompanionConfig = DEFAULT_COMPANION_CONFIG
): number {
  // The layout is centered with max-width of 1200px
  // Content area starts after the sidebar (300px)
  const layoutWidth = Math.min(viewportWidth, config.layout.maxContentWidth);
  const layoutLeft = (viewportWidth - layoutWidth) / 2;
  return layoutLeft + config.layout.sidebarWidth;
}

/**
 * Calculate the left edge of the sidebar.
 * This is where the companion should start (hidden behind it).
 */
export function calculateSidebarLeftEdge(
  viewportWidth: number,
  config: CompanionConfig = DEFAULT_COMPANION_CONFIG
): number {
  const layoutWidth = Math.min(viewportWidth, config.layout.maxContentWidth);
  const layoutLeft = (viewportWidth - layoutWidth) / 2;
  return layoutLeft;
}

/**
 * Calculate the entry position (hidden behind the sidebar).
 * The companion starts completely hidden behind the left sidebar,
 * then emerges into the main content area.
 */
export function calculateEntryPosition(
  viewportWidth: number,
  viewportHeight: number,
  companionSize: number,
  config: CompanionConfig = DEFAULT_COMPANION_CONFIG
): Position {
  const groundY = calculateGroundY(viewportHeight, companionSize, config);
  const sidebarLeft = calculateSidebarLeftEdge(viewportWidth, config);
  
  return {
    // Start completely hidden behind the sidebar
    // Position is at the left edge of the sidebar minus the companion size
    x: sidebarLeft - companionSize + 5, // Almost fully hidden, just 5px might peek
    y: groundY,
  };
}

/**
 * Calculate the initial resting position after entry animation.
 * This is where the companion ends up after the entry animation completes.
 */
export function calculateRestingPosition(
  viewportWidth: number,
  viewportHeight: number,
  companionSize: number,
  config: CompanionConfig = DEFAULT_COMPANION_CONFIG
): Position {
  const groundY = calculateGroundY(viewportHeight, companionSize, config);
  const contentLeftEdge = calculateMainContentLeftEdge(viewportWidth, config);
  
  return {
    // Rest a bit into the content area
    x: contentLeftEdge + config.padding.left,
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
