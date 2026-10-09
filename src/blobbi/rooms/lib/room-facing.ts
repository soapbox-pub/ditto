/**
 * Which way a Blobbi faces while it walks the room: presentation state only,
 * derived from where it is going, never written anywhere.
 *
 * The room is a 2D character in a pseudo-3D diorama seen from its open
 * corner, so "left/right/back/front" are the VIEWER's directions, not the
 * room's axes. A heading in room tiles is split into its lateral part (along
 * the screen's x) and its depth part (into the room, away from the viewer),
 * and the dominant one picks the facing. With the camera at 45° every tile
 * axis is a screen diagonal, so near-diagonal headings need a rule of their
 * own: walking away from the viewer shows the back, walking toward the viewer
 * shows the side it is heading to. Tiny headings (physics settling, the last
 * fraction of a step) keep the current facing so nothing flickers.
 */
import type { BlobbiFacing } from '@blobbi-kit/renderer';

/** The viewer's screen axes in room coordinates (x, z), unit length. */
export interface FacingBasis {
  /** Screen right. */
  right: { x: number; z: number };
  /** Into the room, away from the viewer (the camera's horizontal forward). */
  forward: { x: number; z: number };
}

/**
 * The basis for a camera at this azimuth (the room's `viewDir` convention:
 * the camera sits at `(sin az, cos az)` from the room's centre, looking in).
 */
export function facingBasis(azimuth: number): FacingBasis {
  const s = Math.sin(azimuth);
  const c = Math.cos(azimuth);
  // forward = -(viewDir on the floor); right = forward × up
  return { forward: { x: -s, z: -c }, right: { x: c, z: -s } };
}

/** Headings shorter than this (tiles) are noise: the facing holds. */
export const FACING_DEAD_ZONE = 0.15;
/** One axis must beat the other by this factor to decide alone; nearer than that is a diagonal. */
export const FACING_DIAGONAL_BAND = 1.2;

/**
 * The facing for a heading `(dx, dz)` in room tiles, given the current one.
 *
 *  - below the dead zone: `current` (no change for jitter);
 *  - depth clearly dominant: `'back'` away from the viewer, `'front'` toward;
 *  - lateral clearly dominant: `'right'` / `'left'` as seen on screen;
 *  - a screen diagonal (every tile axis is one): the current facing holds if
 *    it still agrees with the heading (front while heading toward the viewer,
 *    back while heading away, a side while heading to that side), so a walk
 *    does not wobble where a staircase path ends on a single step; otherwise
 *    heading away shows the `'back'` and heading toward shows the side.
 */
export function facingForHeading(dx: number, dz: number, basis: FacingBasis, current: BlobbiFacing): BlobbiFacing {
  if (Math.hypot(dx, dz) < FACING_DEAD_ZONE) return current;
  const lateral = dx * basis.right.x + dz * basis.right.z;
  const depth = dx * basis.forward.x + dz * basis.forward.z;
  const side: BlobbiFacing = lateral >= 0 ? 'right' : 'left';
  if (Math.abs(depth) > FACING_DIAGONAL_BAND * Math.abs(lateral)) return depth > 0 ? 'back' : 'front';
  if (Math.abs(lateral) > FACING_DIAGONAL_BAND * Math.abs(depth)) return side;
  const agrees =
    (current === 'front' && depth < 0) ||
    (current === 'back' && depth > 0) ||
    (current === 'right' && lateral > 0) ||
    (current === 'left' && lateral < 0);
  if (agrees) return current;
  return depth > 0 ? 'back' : side;
}

/** How many waypoints ahead the heading looks, so a staircase path reads as one direction. */
export const FACING_LOOKAHEAD = 3;

/** The point a walker is heading for: a few waypoints ahead, or the path's end. */
export function facingTarget<P>(path: readonly P[]): P | undefined {
  return path[Math.min(path.length, FACING_LOOKAHEAD) - 1];
}

/**
 * A walker's facing this frame: where its remaining path is heading (the
 * lookahead), or front once there is nothing left to walk (arrived, idle, or
 * taken straight there under reduced motion, which leaves no path at all).
 */
export function facingAlongPath(
  x: number,
  z: number,
  path: readonly { x: number; z: number }[],
  current: BlobbiFacing,
  basis: FacingBasis,
): BlobbiFacing {
  const look = facingTarget(path);
  if (!look) return 'front';
  return facingForHeading(look.x - x, look.z - z, basis, current);
}
