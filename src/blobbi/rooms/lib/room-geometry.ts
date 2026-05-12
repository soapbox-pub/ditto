/**
 * Room Geometry Constants
 *
 * Defines the canonical room coordinate canvas. All normalized room positions
 * (furniture x/y, Blobbi placement, future walking targets) assume this fixed
 * aspect ratio so that coordinates are visually stable across viewport sizes.
 *
 * The room canvas is rendered as an absolutely-centered element with this AR,
 * using CSS `aspect-ratio` + `max-width/max-height` to fit within available space.
 * Page-level controls (carousels, HUD, bottom bar) live outside the canvas.
 */

/**
 * Canonical room aspect ratio (width / height).
 *
 * Mobile-first portrait: 4:5 gives a vertical-but-not-too-narrow room that
 * fills most of the phone screen while leaving breathing room for overlaid
 * bottom controls. The coordinate system is [0,1] x [0,1] mapped onto a
 * rectangle of this shape. Furniture, Blobbi, and future walking paths all
 * share this canvas.
 */
export const ROOM_ASPECT_RATIO = 4 / 5;
