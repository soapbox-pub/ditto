/**
 * Centralized debug logging for Blobbi visual system.
 *
 * All Blobbi debug logging should go through this helper.
 * Only logs when BOTH conditions are met:
 *   1. Running in development mode (import.meta.env.DEV)
 *   2. BLOBBI_DEBUG flag is enabled
 *
 * To enable: set BLOBBI_DEBUG = true below.
 * To disable: set BLOBBI_DEBUG = false (default for production-clean console).
 */

/** Master switch for Blobbi visual debug logging. */
const BLOBBI_DEBUG = false;

type DebugCategory =
  | 'svg-rebuild'    // SVG pipeline rebuilds (customizedSvg / safeSvg)
  | 'dom-replace'    // SVG DOM node was replaced (animation killer)
  | 'dom-mount'      // SVG DOM node mounted for first time
  | 'prop-change'    // Props changed on a visual component
  | 'ref-change'     // Object reference changed (companion, blobbi, recipe)
  | 'render-freq'    // Render frequency tracking
  | 'smil'           // SMIL animation element counts
  | 'recipe'         // Recipe resolution and stability
  | 'general';       // Catch-all

/**
 * Log a Blobbi debug message.
 *
 * @param category - Debug category for filtering
 * @param args - Arguments forwarded to console.log
 */
export function debugBlobbi(category: DebugCategory, ...args: unknown[]): void {
  if (!import.meta.env.DEV || !BLOBBI_DEBUG) return;
  console.log(`[blobbi:${category}]`, ...args);
}

/**
 * Log a Blobbi debug warning (always styled as warning).
 */
export function debugBlobbiWarn(category: DebugCategory, ...args: unknown[]): void {
  if (!import.meta.env.DEV || !BLOBBI_DEBUG) return;
  console.warn(`[blobbi:${category}]`, ...args);
}
