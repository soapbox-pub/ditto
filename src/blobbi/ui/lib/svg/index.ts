/**
 * SVG Utilities for Blobbi Visual System
 *
 * Colour manipulation shared by Ditto's own SVG layers (eye animation,
 * emotion overlays). Base-artwork concerns that used to live here (per-instance
 * id namespacing, container fitting) are the canonical renderer's job now:
 * see `../canonical-base.ts`.
 */

export { lightenColor, darkenColor } from './colors';
