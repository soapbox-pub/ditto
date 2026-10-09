/**
 * A walking Blobbi faces where it goes, as the viewer sees it. The room's
 * camera sits at the open (+x, +z) corner at 45°, so each tile axis is a
 * screen diagonal; these tests pin the viewer-relative mapping, the diagonal
 * rule, the dead zone and the lookahead.
 */
import { describe, expect, it } from 'vitest';
import type { BlobbiFacing } from '@blobbi-kit/renderer';
import { FACING_DEAD_ZONE, FACING_DIAGONAL_BAND, FACING_LOOKAHEAD, facingAlongPath, facingBasis, facingForHeading, facingTarget } from './room-facing';

/** The room's camera azimuth (RoomScene's AZIMUTH). */
const AZ = Math.PI / 4;
const B = facingBasis(AZ);
const facing = (dx: number, dz: number, current: BlobbiFacing = 'front') => facingForHeading(dx, dz, B, current);

describe('the viewer\'s axes in room coordinates', () => {
  it('for the 45° camera: toward the viewer is +x+z, screen right is +x-z', () => {
    const s = Math.SQRT1_2;
    expect(B.forward.x).toBeCloseTo(-s);
    expect(B.forward.z).toBeCloseTo(-s);
    expect(B.right.x).toBeCloseTo(s);
    expect(B.right.z).toBeCloseTo(-s);
    // Unit length, perpendicular
    expect(Math.hypot(B.forward.x, B.forward.z)).toBeCloseTo(1);
    expect(B.forward.x * B.right.x + B.forward.z * B.right.z).toBeCloseTo(0);
  });
});

describe('facing from a heading', () => {
  it('idle: no heading keeps the current facing (front at rest)', () => {
    expect(facing(0, 0)).toBe('front');
    expect(facing(0, 0, 'left')).toBe('left');
  });

  it('straight toward the viewer -> front; straight away -> back', () => {
    expect(facing(1, 1)).toBe('front');
    expect(facing(-1, -1, 'right')).toBe('back');
  });

  it('screen left -> left; screen right -> right', () => {
    expect(facing(-1, 1)).toBe('left'); // -right
    expect(facing(1, -1)).toBe('right'); // +right
  });

  it('along the tile axes (screen diagonals): the current facing holds while it agrees; otherwise away shows the back, toward shows the side', () => {
    // From rest (front): toward the viewer stays front, away turns to the back
    expect(facing(1, 0)).toBe('front'); // +x: toward, screen-right
    expect(facing(0, 1)).toBe('front'); // +z: toward, screen-left
    expect(facing(-1, 0)).toBe('back'); // -x: away, screen-left
    expect(facing(0, -1)).toBe('back'); // -z: away, screen-right
    // Already turned the other way, the side it heads to is shown
    expect(facing(1, 0, 'back')).toBe('right');
    expect(facing(0, 1, 'back')).toBe('left');
    // A side that agrees holds: walking -x (screen-left, away) keeps a left-facing Blobbi facing left
    expect(facing(-1, 0, 'left')).toBe('left');
    expect(facing(-1, 0, 'right')).toBe('back');
    expect(facing(0, -1, 'right')).toBe('right');
    expect(facing(1, 0, 'left')).toBe('right');
  });

  it('a heading just past the diagonal band is decided by the dominant axis', () => {
    const k = FACING_DIAGONAL_BAND + 0.05;
    // Mostly away, a little to the right: back. Mostly right, a little away: right.
    const away = { dx: B.forward.x * k + B.right.x, dz: B.forward.z * k + B.right.z };
    const right = { dx: B.forward.x + B.right.x * k, dz: B.forward.z + B.right.z * k };
    expect(facing(away.dx, away.dz)).toBe('back');
    expect(facing(right.dx, right.dz)).toBe('right');
    // Mostly toward, a little left: front. Mostly left, a little toward: left.
    const toward = { dx: -B.forward.x * k - B.right.x, dz: -B.forward.z * k - B.right.z };
    const left = { dx: -B.forward.x - B.right.x * k, dz: -B.forward.z - B.right.z * k };
    expect(facing(toward.dx, toward.dz)).toBe('front');
    expect(facing(left.dx, left.dz)).toBe('left');
  });

  it('tiny or noisy headings never change the facing', () => {
    let current: BlobbiFacing = 'right';
    const e = FACING_DEAD_ZONE * 0.6;
    for (const [dx, dz] of [[e, 0], [-e, 0], [0, e], [0, -e], [e * 0.5, -e * 0.5], [-e * 0.7, e * 0.7]]) {
      current = facing(dx, dz, current);
      expect(current).toBe('right');
    }
    // Exactly at the dead zone it still holds; just past it, it turns.
    expect(facing(-FACING_DEAD_ZONE * 0.999 * Math.SQRT1_2, FACING_DEAD_ZONE * 0.999 * Math.SQRT1_2, 'right')).toBe('right');
    expect(facing(-FACING_DEAD_ZONE * 1.01, FACING_DEAD_ZONE * 1.01, 'right')).toBe('left');
  });

  it('a walk is one direction, then front: the facing follows a staircase path\'s lookahead, not each step', () => {
    // A 4-connected path that stair-steps toward the viewer and to the right: +x, +z, +x, +z, ...
    const path = [{ x: 1, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 2, z: 2 }, { x: 3, z: 2 }, { x: 3, z: 3 }];
    let at = { x: 0, z: 0 };
    let current: BlobbiFacing = 'front';
    const seen = new Set<BlobbiFacing>();
    while (path.length) {
      const look = facingTarget(path)!;
      current = facingForHeading(look.x - at.x, look.z - at.z, B, current);
      seen.add(current);
      at = path.shift()!;
    }
    // Net heading is toward the viewer (+x+z): front throughout, including the last single step, never flipping left/right
    expect([...seen]).toEqual(['front']);
    // And a staircase away and to the left (-z, -x, ...) is one turn to the back, held to the end
    const away = [{ x: 0, z: -1 }, { x: -1, z: -1 }, { x: -1, z: -2 }, { x: -2, z: -2 }, { x: -2, z: -3 }];
    at = { x: 0, z: 0 }; current = 'front'; seen.clear();
    while (away.length) { const look = facingTarget(away)!; current = facingForHeading(look.x - at.x, look.z - at.z, B, current); seen.add(current); at = away.shift()!; }
    expect([...seen]).toEqual(['back']);
    expect(facingTarget([])).toBeUndefined();
    expect(facingTarget([{ x: 5, z: 5 }])).toEqual({ x: 5, z: 5 });
    expect(facingTarget([1, 2, 3, 4, 5])).toBe(FACING_LOOKAHEAD);
  });
});

describe('a walker along its path (what the scene does each frame)', () => {
  /** Walk a 4-connected path step by step, recording the facing before each step and after arrival. */
  function walk(path: { x: number; z: number }[], start = { x: 0, z: 0 }, current: BlobbiFacing = 'front') {
    const remaining = [...path];
    let at = { ...start };
    const facings: BlobbiFacing[] = [];
    while (remaining.length) {
      current = facingAlongPath(at.x, at.z, remaining, current, B);
      facings.push(current);
      at = remaining.shift()!;
    }
    // Arrived: nothing left to walk.
    const idle = facingAlongPath(at.x, at.z, remaining, current, B);
    return { facings, idle };
  }
  const straight = (dx: number, dz: number, n = 4) => Array.from({ length: n }, (_, i) => ({ x: (i + 1) * dx, z: (i + 1) * dz }));

  it('walking toward the viewer shows the front, away the back, and to each screen side that side', () => {
    expect(walk(straight(1, 1)).facings.every((f) => f === 'front')).toBe(true);     // +x+z: toward the viewer
    expect(walk(straight(-1, -1)).facings.every((f) => f === 'back')).toBe(true);    // -x-z: away
    expect(walk(straight(1, -1)).facings.every((f) => f === 'right')).toBe(true);    // +x-z: screen right
    expect(walk(straight(-1, 1)).facings.every((f) => f === 'left')).toBe(true);     // -x+z: screen left
  });

  it('turns back to the front on arrival, from any side, and stays front while idle', () => {
    for (const [dx, dz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      const { facings, idle } = walk(straight(dx, dz));
      expect(facings.length).toBeGreaterThan(0);
      expect(idle, `${dx},${dz}`).toBe('front');
    }
    // Idle with no path keeps front whatever it faced a moment ago.
    expect(facingAlongPath(3, 3, [], 'left', B)).toBe('front');
    expect(facingAlongPath(3, 3, [], 'back', B)).toBe('front');
  });

  it('a diagonal staircase path (every tile axis is a screen diagonal) reads as one direction, not a wobble', () => {
    // Stair-stepping to screen right (+x, then -z, …): a side the whole way.
    const right = [{ x: 1, z: 0 }, { x: 1, z: -1 }, { x: 2, z: -1 }, { x: 2, z: -2 }, { x: 3, z: -2 }, { x: 3, z: -3 }];
    expect(new Set(walk(right).facings)).toEqual(new Set(['right']));
    // Stair-stepping away (-x, then -z, …): the back the whole way, then front on arrival.
    const away = [{ x: -1, z: 0 }, { x: -1, z: -1 }, { x: -2, z: -1 }, { x: -2, z: -2 }];
    const a = walk(away);
    expect(new Set(a.facings)).toEqual(new Set(['back']));
    expect(a.idle).toBe('front');
  });

  it('under reduced motion the scene takes a walker straight to its tile and leaves it no path: it never turns', () => {
    // walkToTile sets the position and an empty path; each frame then asks for the facing of an empty path.
    expect(facingAlongPath(7.5, 2.5, [], 'front', B)).toBe('front');
    expect(facingAlongPath(7.5, 2.5, [], 'right', B)).toBe('front');
  });
});
