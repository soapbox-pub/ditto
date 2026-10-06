/**
 * Official Blobbi furniture as Simple Nostr Objects.
 *
 * Every `official:*` furniture ID is modelled here with the SNO builder, so
 * the room renders official furniture and objects people publish (kind 33331)
 * the same way. Models are built on first use and cached.
 *
 * Units are centimetres (MODEL_UNITS_PER_TILE per floor tile), so models
 * keep their real relative sizes in the room. Fronts face +Z; wall pieces
 * have their back at z = 0.
 */

import { SnoBuilder, type SnoPayload } from './sno-builder';

type Vec3 = [number, number, number];

/** Behaviour the room adds on top of an official model's geometry. */
export interface ModelExtras {
  /** A warm point light, for lamps. */
  light?: { at: Vec3; color: string; intensity: number };
  /** A live clock face drawn by the room. */
  clock?:
    | { kind: 'analog'; center: Vec3; radius: number; hands: string }
    | { kind: 'digital'; center: Vec3; width: number; height: number; ink: string; paper: string };
  /** Where a picture frame's uploaded image goes. */
  picture?: { center: Vec3; width: number; height: number; oval?: boolean };
  /** Bulbs the room draws self-lit in their own colours, dimming as the lamp goes off. */
  bulbs?: { at: Vec3; radius: Vec3; color: string }[];
  /** A lampshade's side as a lathe profile ([radius, y] pairs), which the room makes glow while the lamp is on. */
  shade?: { profile: [number, number][]; segments: number; color: string };
}

export interface OfficialModel {
  payload: SnoPayload;
  extras?: ModelExtras;
}

// ─── Shared parts ─────────────────────────────────────────────────────────────

const TERRACOTTA = ['#c2410c', '#b45309', '#9a3412'];
const LEAF = ['#16a34a', '#15803d', '#22c55e', '#4ade80'];
const SOIL = '#5b3a1e';

function pot(b: SnoBuilder, radius: number, height: number, colors = TERRACOTTA) {
  b.lathe([[0, 0], [radius * 0.78, 0], [radius, height * 0.82], [radius * 1.08, height * 0.84], [radius * 1.08, height], [radius * 0.94, height]], 12, [colors[1], colors[0], colors[2], colors[2], colors[1]]);
  b.cylinder([0, height * 0.86, 0], radius * 0.94, 0.4, 12, SOIL);
}

function leaf(b: SnoBuilder, at: Vec3, length: number, width: number, ry: number, tilt: number, color: string) {
  // Tilt up first, then turn around the stem, so every leaf rises
  b.with({ at, ry }, () => b.with({ rz: tilt }, () => {
    b.sphere([length / 2, 0, 0], [length / 2, width * 0.18, width / 2], color, 8, 4);
  }));
}

function book(b: SnoBuilder, x: number, y: number, z: number, w: number, h: number, d: number, color: string, lean = 0) {
  b.with({ at: [x, y, z], rz: lean }, () => {
    b.box([0, h / 2, 0], [w, h, d], [color, color, '#f5efe0']);
  });
}

// ─── Plants ───────────────────────────────────────────────────────────────────

function plantSmall(): OfficialModel {
  const b = new SnoBuilder();
  pot(b, 7, 10);
  for (let i = 0; i < 7; i++) {
    leaf(b, [0, 10.5, 0], 8 + (i % 3), 5, i * 51, 35 + (i % 2) * 15, LEAF[i % LEAF.length]);
  }
  b.sphere([0, 13, 0], [3.5, 3, 3.5], LEAF[2], 8, 5);
  return { payload: b.build('Small Plant') };
}

function plantTall(): OfficialModel {
  const b = new SnoBuilder();
  pot(b, 9, 14);
  b.cylinder([0, 14, 0], 0.8, 46, 6, '#3f6212', 0.5);
  for (let i = 0; i < 9; i++) {
    const y = 20 + i * 4.6;
    leaf(b, [0, y, 0], 12 - i * 0.6, 7, i * 137, 25 + (i % 3) * 8, LEAF[i % LEAF.length]);
  }
  b.sphere([0, 61, 0], [3, 4, 3], LEAF[3], 8, 5);
  return { payload: b.build('Tall Plant') };
}

function plantCactus(): OfficialModel {
  const b = new SnoBuilder();
  pot(b, 6, 9, ['#e8d5b5', '#d6c09a', '#c4a87a']);
  const green = '#15803d';
  b.cylinder([0, 9, 0], 3.6, 18, 8, green, 3.6);
  b.sphere([0, 27, 0], [3.6, 3, 3.6], green, 8, 4);
  b.with({ at: [3.4, 16, 0] }, () => {
    b.cylinder([0, 0, 0], 1.6, 2, 6, green);
    b.with({ at: [1.6, 1, 0] }, () => b.cylinder([0, 0, 0], 1.6, 6, 6, green));
    b.sphere([1.6, 7, 0], 1.6, green, 6, 4);
  });
  b.with({ at: [-3.4, 19, 0] }, () => {
    b.cylinder([-1.4, 0, 0], 1.4, 5, 6, green);
    b.sphere([-1.4, 5, 0], 1.4, green, 6, 4);
  });
  b.sphere([0, 30, 0], [1.6, 1.2, 1.6], '#f472b6', 8, 4);
  return { payload: b.build('Cactus') };
}

function plantFern(): OfficialModel {
  const b = new SnoBuilder();
  pot(b, 8, 10, ['#e2e8f0', '#cbd5e1', '#94a3b8']);
  for (let i = 0; i < 10; i++) {
    b.with({ at: [0, 10, 0], ry: i * 36 + (i % 2) * 18 }, () => b.with({ rz: 30 + (i % 3) * 12 }, () => {
      for (let s = 0; s < 5; s++) {
        b.sphere([3 + s * 3, s * 0.4, 0], [1.8, 0.4, 2.6 - s * 0.35], LEAF[(i + s) % LEAF.length], 6, 3);
      }
    }));
  }
  return { payload: b.build('Fern') };
}

function plantHanging(): OfficialModel {
  const b = new SnoBuilder();
  const rope = '#a8865a';
  b.box([0, 40, 1], [3, 1.5, 2], '#78716c');
  for (const x of [-5, 5]) {
    b.with({ at: [0, 40, 1], rz: x > 0 ? -12 : 12 }, () => b.cylinder([0, -18, 0], 0.25, 18, 4, rope));
  }
  b.with({ at: [0, 13, 1] }, () => pot(b, 6, 9, ['#f5f5f4', '#e7e5e4', '#d6d3d1']));
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    for (let s = 0; s < 4; s++) {
      b.sphere([side * (4 + s * 0.6), 20 - s * 4 - i * 0.6, 3 - (i % 3)], [1.8, 1.5, 1.2], LEAF[(i + s) % LEAF.length], 6, 4);
    }
  }
  return { payload: b.build('Hanging Plant') };
}

// ─── Lamps ────────────────────────────────────────────────────────────────────

const BRASS = '#b08d57';
const SHADE = ['#fef3c7', '#fde68a', '#fbbf24'];
/** A shade's colour with the bulb shining through it. */
const SHADE_LIT = '#fff1c2';

function lampFloor(): OfficialModel {
  const b = new SnoBuilder();
  b.cylinder([0, 0, 0], 7, 1.5, 12, '#57534e', 6);
  b.cylinder([0, 1.5, 0], 0.8, 66, 6, BRASS);
  b.lathe([[0, 64], [12, 64], [7, 80], [0, 80]], 12, [SHADE[0], SHADE[1], SHADE[2]]);
  b.sphere([0, 66, 0], 2.4, '#fffbeb', 8, 4);
  return { payload: b.build('Floor Lamp'), extras: { light: { at: [0, 68, 4], color: '#ffd9a0', intensity: 1 }, shade: { profile: [[12, 64], [7, 80]], segments: 12, color: SHADE_LIT } } };
}

function lampTable(): OfficialModel {
  const b = new SnoBuilder();
  b.lathe([[0, 0], [5, 0], [6, 4], [3.5, 12], [1, 14], [0, 14]], 10, ['#0f766e', '#14b8a6', '#0d9488', '#0f766e']);
  b.lathe([[0, 13], [9, 13], [5.5, 24], [0, 24]], 10, [SHADE[0], SHADE[1], SHADE[2]]);
  return { payload: b.build('Table Lamp'), extras: { light: { at: [0, 16, 4], color: '#ffd9a0', intensity: 0.6 }, shade: { profile: [[9, 13], [5.5, 24]], segments: 10, color: SHADE_LIT } } };
}

function lampWall(): OfficialModel {
  const b = new SnoBuilder();
  b.box([0, 8, 0.5], [5, 8, 1], BRASS);
  b.with({ at: [0, 9, 1], rx: 50 }, () => b.cylinder([0, 0, 0], 0.6, 8, 6, BRASS));
  b.lathe([[0, 12], [6, 12], [3.5, 20], [0, 20]], 10, [SHADE[0], SHADE[1], SHADE[2]]);
  return { payload: b.build('Wall Lamp'), extras: { light: { at: [0, 13, 6], color: '#ffd9a0', intensity: 0.5 }, shade: { profile: [[6, 12], [3.5, 20]], segments: 10, color: SHADE_LIT } } };
}

function lampString(): OfficialModel {
  const b = new SnoBuilder();
  // Rainbow bulbs, big enough to read as colours from across the room
  const bulbs = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
  // Exactly four tiles long, so two run a wall corner to corner on the half-tile snap
  const width = 120;
  const sag = 12;
  const count = 11;
  const hook = 1.2;
  // The room hangs wall pieces this far off the wall (its WALL_OFFSET, in these units)
  const wallGap = 1.2;
  // Hooks flush with the wall at either end. The wire hangs off the hooks'
  // fronts, and the sag starts as far in from each end as the wire is off the
  // wall, so two strings meeting in a corner touch at one point rather than
  // cross; a straight lead runs from each hook to where the sag begins.
  const inset = hook + wallGap;
  const span = width - 2 * inset;
  for (const x of [-width / 2 + hook / 2, width / 2 - hook / 2]) b.box([x, 20, hook / 2], [hook, hook, hook], '#3f3f46');
  const wire = (from: Vec3, to: Vec3) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    b.with({ at: from, rz: (Math.atan2(dy, dx) * 180) / Math.PI - 90 }, () => b.cylinder([0, 0, 0], 0.25, Math.hypot(dx, dy), 4, '#3f3f46'));
  };
  wire([-width / 2 + hook / 2, 20, hook], [-span / 2, 20, hook]);
  wire([span / 2, 20, hook], [width / 2 - hook / 2, 20, hook]);
  let prev: Vec3 | undefined;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const p: Vec3 = [(t - 0.5) * span, 20 - Math.sin(t * Math.PI) * sag, hook];
    if (prev) wire(prev, p);
    prev = p;
  }
  // Bulbs sit just forward of the wire, with nothing reaching behind the hooks' backs
  const glow: NonNullable<ModelExtras['bulbs']> = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const x = (t - 0.5) * span;
    const y = 20 - Math.sin(t * Math.PI) * sag;
    const z = hook + 0.4;
    const color = bulbs[i % bulbs.length];
    b.cylinder([x, y - 1.8, z], 0.8, 1.8, 6, '#52525b');
    b.sphere([x, y - 4.4, z], [2, 2.8, 1.6], color, 8, 5);
    glow.push({ at: [x, y - 4.4, z], radius: [2, 2.8, 1.6], color });
  }
  // Each bulb glows and haloes the wall in its own colour, and casts no light
  // into the room: a lamp of strength 0 still switches on and off with a tap
  return { payload: b.build('String Lights'), extras: { light: { at: [0, 10, 6], color: '#fff4e0', intensity: 0 }, bulbs: glow } };
}

// ─── Rugs ─────────────────────────────────────────────────────────────────────

function rugRound(): OfficialModel {
  const b = new SnoBuilder();
  b.cylinder([0, 0, 0], 50, 0.8, 32, '#c08457');
  b.cylinder([0, 0.8, 0], 40, 0.2, 32, '#e0b083');
  b.cylinder([0, 1, 0], 28, 0.2, 32, '#c08457');
  b.cylinder([0, 1.2, 0], 16, 0.2, 32, '#f2d1a8');
  return { payload: b.build('Round Rug') };
}

function rugRectangle(): OfficialModel {
  const b = new SnoBuilder();
  b.box([0, 0.4, 0], [100, 0.8, 64], '#7c3aed');
  b.box([0, 0.9, 0], [88, 0.2, 52], '#ede9fe');
  b.box([0, 1.1, 0], [72, 0.2, 36], '#a78bfa');
  for (const x of [-30, -10, 10, 30]) b.box([x, 1.3, 0], [6, 0.2, 6], '#f5f3ff');
  return { payload: b.build('Rectangle Rug') };
}

function rugRunner(): OfficialModel {
  const b = new SnoBuilder();
  b.box([0, 0.4, 0], [120, 0.8, 34], '#0e7490');
  const stripes = ['#f0fdfa', '#5eead4', '#f0fdfa'];
  stripes.forEach((c, i) => b.box([0, 0.9 + i * 0.01, (i - 1) * 9], [112, 0.2, 3], c));
  for (const x of [-61, 61]) {
    for (let z = -15; z <= 15; z += 3) b.box([x, 0.4, z], [3, 0.4, 0.8], '#ccfbf1');
  }
  return { payload: b.build('Runner Rug') };
}

function rugPaw(): OfficialModel {
  const b = new SnoBuilder();
  const pad = '#f9a8d4';
  b.with({ at: [0, 0, 6], scale: [1, 1, 0.8] }, () => b.cylinder([0, 0, 0], 22, 1, 20, pad));
  for (const [x, z] of [[-24, -14], [-9, -26], [9, -26], [24, -14]]) {
    b.with({ at: [x, 0, z], scale: [1, 1, 1.2] }, () => b.cylinder([0, 0, 0], 8, 1, 14, pad));
  }
  b.with({ at: [0, 1, 6], scale: [1, 1, 0.8] }, () => b.cylinder([0, 0, 0], 14, 0.2, 20, '#fbcfe8'));
  return { payload: b.build('Paw Rug') };
}

// ─── Shelves & storage ────────────────────────────────────────────────────────

const OAK = '#a16207';
const OAK_LIGHT = '#ca8a04';

function shelfWall(): OfficialModel {
  const b = new SnoBuilder();
  b.box([0, 0, 6], [60, 2.4, 12], [OAK, OAK, OAK_LIGHT]);
  for (const x of [-22, 22]) {
    b.box([x, -4, 1], [1.6, 8, 2], '#3f3f46');
    b.box([x, -1.6, 6], [1.6, 1, 10], '#3f3f46');
  }
  book(b, -20, 1.2, 6, 3, 11, 8, '#2563eb');
  book(b, -16.6, 1.2, 6, 3, 9, 8, '#dc2626');
  book(b, -13, 1.2, 6, 3, 10, 8, '#16a34a', -14);
  b.with({ at: [8, 1.2, 6] }, () => pot(b, 3, 4));
  b.sphere([8, 7, 6], 2.6, LEAF[0], 8, 5);
  b.sphere([20, 4.2, 6], 3, '#f59e0b', 10, 6);
  return { payload: b.build('Wall Shelf') };
}

function shelfFloating(): OfficialModel {
  const b = new SnoBuilder();
  b.box([0, 0, 5], [70, 2, 10], ['#f5f5f4', '#d6d3d1', '#fafaf9']);
  b.lathe([[0, 1], [3, 1], [3.4, 6], [2, 9], [2.4, 11], [0, 11]], 10, ['#60a5fa', '#3b82f6', '#93c5fd']);
  b.with({ at: [-18, 0, 0] }, () => b.lathe([[0, 1], [3, 1], [3.4, 6], [2, 9], [2.4, 11], [0, 11]], 10, ['#f472b6']));
  book(b, 18, 1, 5, 9, 2.4, 7, '#7c3aed');
  book(b, 18, 3.4, 5, 8, 2, 6, '#f59e0b');
  return { payload: b.build('Floating Shelf') };
}

function shelfBooks(): OfficialModel {
  const b = new SnoBuilder();
  const w = 40, h = 80, d = 18;
  // The back and shelves sit between the sides, all under one cap, so no two faces share a plane
  b.box([0, (h - 2) / 2, -d / 2 + 0.5], [w - 4, h - 2, 1], '#78350f');
  for (const x of [-w / 2 + 1, w / 2 - 1]) b.box([x, (h - 2) / 2, 0], [2, h - 2, d], [OAK, OAK, OAK_LIGHT]);
  b.box([0, h - 1, 0], [w, 2, d], [OAK, OAK, OAK_LIGHT]);
  const colors = ['#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#db2777'];
  for (let s = 0; s < 3; s++) {
    const y = 1 + s * 26;
    b.box([0, y, 1], [w - 4, 2, d - 2], [OAK, OAK, OAK_LIGHT]);
    let x = -w / 2 + 3;
    let i = s * 2;
    for (;;) {
      const bw = 2.4 + ((i * 7) % 3);
      const bh = 15 + ((i * 5) % 7);
      const lean = i % 5 === 4 ? -10 : 0;
      // A leaning book's top reaches this far over; the next book starts just past it, so it rests on it
      const reach = bh * Math.sin((-lean * Math.PI) / 180);
      if (x + bw + reach > w / 2 - 3) break;
      book(b, x + bw / 2, y + 1, 0, bw, bh, d - 4, colors[i % colors.length], lean);
      x += bw + reach + (lean ? 0.2 : 0.6);
      i++;
    }
  }
  return { payload: b.build('Bookcase') };
}

function cabinetSmall(): OfficialModel {
  const b = new SnoBuilder();
  const w = 36, h = 40, d = 20;
  for (const x of [-w / 2 + 3, w / 2 - 3]) b.cylinder([x, 0, d / 2 - 3], 1, 6, 6, '#44403c');
  b.box([0, 6 + h / 2, 0], [w, h, d], ['#fde68a', '#fcd34d', '#fef3c7']);
  b.box([-w / 4, 6 + h / 2, d / 2 + 0.3], [w / 2 - 2, h - 4, 0.6], '#fbbf24');
  b.box([w / 4, 6 + h / 2, d / 2 + 0.3], [w / 2 - 2, h - 4, 0.6], '#fbbf24');
  for (const x of [-2.5, 2.5]) b.sphere([x, 6 + h / 2, d / 2 + 1.2], 1, BRASS, 6, 4);
  b.box([0, 6 + h + 0.8, 0], [w + 2, 1.6, d + 2], OAK);
  return { payload: b.build('Small Cabinet') };
}

function counter(): OfficialModel {
  const b = new SnoBuilder();
  // Deep enough to sit close to the wall in its two tiles
  const w = 60, h = 42, d = 50;
  const body: [string, string, string] = ['#f5f5f4', '#e7e5e4', '#fafaf9'];
  b.box([0, 3, 0], [w - 6, 6, d - 6], '#44403c');
  b.box([0, 6 + h / 2, 0], [w, h, d], body);
  // Two drawers over two doors
  for (const x of [-w / 4, w / 4]) {
    b.box([x, 6 + h - 7, d / 2 + 0.4], [w / 2 - 3, 10, 0.8], '#e7e5e4');
    b.box([x, 6 + (h - 16) / 2, d / 2 + 0.4], [w / 2 - 3, h - 16, 0.8], '#e7e5e4');
    b.box([x, 6 + h - 7, d / 2 + 1.4], [8, 1.2, 1.2], BRASS);
    b.box([x + (x < 0 ? 10 : -10), 6 + h - 24, d / 2 + 1.4], [1.2, 8, 1.2], BRASS);
  }
  b.box([0, 6 + h + 1, 0], [w + 2, 2, d + 2], [OAK, OAK, OAK_LIGHT]);
  // A chopping board to one side; the worktop stays flat so small things stand on it
  b.box([-14, 6 + h + 2.6, 4], [20, 1.2, 14], ['#d6a77a', '#c8956c', '#e6c39f']);
  return { payload: b.build('Counter') };
}

function tableSide(): OfficialModel {
  const b = new SnoBuilder();
  const w = 34, h = 40, d = 26;
  for (const [x, z] of [[-w / 2 + 3, -d / 2 + 3], [w / 2 - 3, -d / 2 + 3], [-w / 2 + 3, d / 2 - 3], [w / 2 - 3, d / 2 - 3]]) {
    b.cylinder([x, 0, z], 1.4, h - 2, 6, OAK, 1.2);
  }
  b.box([0, h - 1, 0], [w, 2.4, d], [OAK, OAK, OAK_LIGHT]);
  b.box([0, h - 8, 0], [w - 4, 8, d - 4], ['#b45309', OAK, OAK]);
  b.sphere([0, h - 8, d / 2 - 1.6], 1, BRASS, 6, 4);
  b.box([0, 8, 0], [w - 4, 1.4, d - 4], OAK);
  return { payload: b.build('Side Table') };
}

// ─── Beds ─────────────────────────────────────────────────────────────────────

function bedSingle(): OfficialModel {
  const b = new SnoBuilder();
  const w = 100, d = 64;
  for (const x of [-w / 2 + 3, w / 2 - 3]) for (const z of [-d / 2 + 3, d / 2 - 3]) b.box([x, 4, z], [4, 8, 4], OAK);
  b.box([0, 11, 0], [w, 6, d], [OAK, OAK, OAK_LIGHT]);
  b.box([-w / 2 + 2, 24, 0], [4, 32, d], [OAK, OAK, OAK_LIGHT]);
  b.box([0, 18, 0], [w - 6, 8, d - 4], ['#f8fafc', '#e2e8f0', '#ffffff']);
  b.box([10, 22.5, 0], [w - 34, 2, d - 2], ['#818cf8', '#6366f1', '#a5b4fc']);
  b.box([28, 21, 0], [10, 3, d - 2], ['#c7d2fe', '#a5b4fc', '#e0e7ff']);
  b.with({ at: [-w / 2 + 16, 24, 0], rz: -10 }, () => b.sphere([0, 0, 0], [9, 3.6, 18], '#ffffff', 10, 5));
  return { payload: b.build('Single Bed') };
}

function bedRound(): OfficialModel {
  const b = new SnoBuilder();
  b.lathe([[0, 0], [30, 0], [33, 4], [33, 10], [30, 14], [25, 13], [23, 6], [0, 6]], 20, ['#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#a78bfa', '#ddd6fe', '#ede9fe']);
  b.sphere([0, 7, 0], [22, 3, 22], '#f5f3ff', 16, 4);
  return { payload: b.build('Round Pet Bed') };
}

function bedCushion(): OfficialModel {
  const b = new SnoBuilder();
  b.sphere([0, 6, 0], [30, 6, 24], '#f9a8d4', 14, 6);
  b.sphere([0, 10, 0], [20, 3, 16], '#fbcfe8', 12, 4);
  for (const [x, z] of [[-26, -20], [26, -20], [-26, 20], [26, 20]]) b.sphere([x, 6, z], 2, '#ec4899', 6, 4);
  return { payload: b.build('Cushion') };
}

function bedBasket(): OfficialModel {
  const b = new SnoBuilder();
  const weave = ['#b45309', '#d97706', '#b45309', '#d97706', '#b45309', '#92400e'];
  b.with({ scale: [1, 1, 0.75] }, () => {
    b.lathe([[0, 0], [24, 0], [28, 4], [30, 8], [31, 12], [31, 16], [30, 17], [27, 16], [0, 10]], 18, [...weave, '#fbbf24']);
  });
  b.with({ at: [0, 12, 0], scale: [1, 1, 0.75] }, () => b.sphere([0, 0, 0], [24, 3, 24], '#fecaca', 14, 4));
  b.with({ at: [0, 16, -18], rx: -20 }, () => b.box([0, 0, 0], [40, 3, 12], ['#f87171', '#ef4444', '#fca5a5']));
  return { payload: b.build('Basket Bed') };
}

// ─── Clocks ───────────────────────────────────────────────────────────────────

function analogWallClock(name: string, rim: string, face: string, hands: string, extra?: (b: SnoBuilder) => void): OfficialModel {
  const b = new SnoBuilder();
  const r = 14;
  b.with({ at: [0, r + 2, 0] }, () => {
    b.with({ rx: 90 }, () => b.lathe([[0, -2], [r + 2, -2], [r + 2, 2], [r, 2.2], [0, 2.2]], 24, [rim, rim, rim, face]));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      b.box([Math.sin(a) * (r - 2), Math.cos(a) * (r - 2), 2.4], i % 3 === 0 ? [1.2, 2.6, 0.3] : [0.8, 1.4, 0.3], hands);
    }
    extra?.(b);
  });
  return {
    payload: b.build(name),
    extras: { clock: { kind: 'analog', center: [0, r + 2, 2.6], radius: r - 3, hands } },
  };
}

function clockTableAnalog(): OfficialModel {
  const b = new SnoBuilder();
  const r = 9;
  b.box([0, 1.5, 0], [22, 3, 9], ['#78350f', '#78350f', '#92400e']);
  b.with({ at: [0, 3 + r + 1, 0] }, () => {
    b.with({ rx: 90 }, () => b.lathe([[0, -3], [r + 2, -3], [r + 2, 2], [r, 2.2], [0, 2.2]], 20, ['#92400e', '#92400e', '#92400e', '#fffbeb']));
  });
  return { payload: b.build('Table Clock'), extras: { clock: { kind: 'analog', center: [0, 3 + r + 1, 2.4], radius: r - 1.5, hands: '#1c1917' } } };
}

function clockAlarm(): OfficialModel {
  const b = new SnoBuilder();
  const r = 9;
  const body = '#ef4444';
  for (const x of [-6, 6]) b.with({ at: [x, 0, 0], rz: x > 0 ? -15 : 15 }, () => b.cylinder([0, 0, 0], 0.8, 4, 6, '#44403c'));
  b.with({ at: [0, 4 + r, 0] }, () => {
    b.with({ rx: 90 }, () => b.lathe([[0, -3.5], [r + 1.5, -3.5], [r + 1.5, 2], [r, 2.2], [0, 2.2]], 20, [body, body, body, '#fffbeb']));
  });
  for (const x of [-6, 6]) b.with({ at: [x, 4 + r * 2 + 1, 0], rz: x > 0 ? -25 : 25 }, () => b.sphere([0, 0, 0], [4, 3, 4], '#fbbf24', 8, 4));
  b.box([0, 4 + r * 2 + 2.6, 0], [3, 1.2, 1.2], '#44403c');
  return { payload: b.build('Alarm Clock'), extras: { clock: { kind: 'analog', center: [0, 4 + r, 2.4], radius: r - 1.5, hands: '#1c1917' } } };
}

function digitalClock(name: string, w: number, h: number, d: number, body: string, screen: string, ink: string, wall: boolean, flip = false): OfficialModel {
  const b = new SnoBuilder();
  const y = wall ? 0 : 2;
  if (!wall) {
    b.box([-w / 2 + 3, 1, 0], [3, 2, d - 2], '#27272a');
    b.box([w / 2 - 3, 1, 0], [3, 2, d - 2], '#27272a');
  }
  b.box([0, y + h / 2, wall ? d / 2 : 0], [w, h, d], [body, body, body]);
  if (flip) {
    for (const x of [-w / 4, w / 4]) b.box([x, y + h / 2, (wall ? d : d / 2) + 0.2], [w / 2 - 3, h - 4, 0.4], '#18181b');
  }
  return {
    payload: b.build(name),
    extras: { clock: { kind: 'digital', center: [0, y + h / 2, (wall ? d : d / 2) + 0.5], width: w - 4, height: h - 4, ink, paper: screen } },
  };
}

// ─── Picture frames ───────────────────────────────────────────────────────────

/** A little default painting: sky, sun, hills. Drawn in the XY plane at z. */
function painting(b: SnoBuilder, w: number, h: number, z: number, oval = false) {
  if (oval) b.disc([0, 0, z], [w / 2, h / 2], '#7dd3fc', 28);
  else b.polygon([[-w / 2, -h / 2, z], [w / 2, -h / 2, z], [w / 2, h / 2, z], [-w / 2, h / 2, z]], '#7dd3fc');
  b.disc([w * 0.2, h * 0.18, z + 0.1], Math.min(w, h) * 0.12, '#fde047', 16);
  // Hills sized to stay inside an oval opening too
  b.disc([-w * 0.12, -h * 0.24, z + 0.2], [w * 0.32, h * 0.16], '#4ade80', 18);
  b.disc([w * 0.18, -h * 0.28, z + 0.3], [w * 0.22, h * 0.13], '#22c55e', 18);
}

function frame(name: string, w: number, h: number, border: number, color: string, accent: string, oval = false): OfficialModel {
  const b = new SnoBuilder();
  const depth = 2.4;
  b.with({ at: [0, h / 2, 0] }, () => {
    if (oval) {
      b.with({ scale: [w / h, 1, 1] }, () => {
        b.torus([0, 0, depth / 2], h / 2 - border / 2, border / 2, color, 32, 6);
      });
      painting(b, w - border * 2, h - border * 2, 0.4, true);
    } else {
      b.box([0, h / 2 - border / 2, depth / 2], [w, border, depth], [color, accent, accent]);
      b.box([0, -h / 2 + border / 2, depth / 2], [w, border, depth], [color, accent, accent]);
      b.box([-w / 2 + border / 2, 0, depth / 2], [border, h - border * 2, depth], [color, accent, accent]);
      b.box([w / 2 - border / 2, 0, depth / 2], [border, h - border * 2, depth], [color, accent, accent]);
      painting(b, w - border * 2, h - border * 2, 0.4);
    }
  });
  return {
    payload: b.build(name),
    extras: { picture: { center: [0, h / 2, 0.8], width: w - border * 2, height: h - border * 2, oval } },
  };
}

// ─── Interactive pieces ───────────────────────────────────────────────────────

function fridge(): OfficialModel {
  const b = new SnoBuilder();
  const w = 56, h = 130, d = 52;
  const body: [string, string, string] = ['#e0f2fe', '#bae6fd', '#f0f9ff'];
  b.box([0, 3, 0], [w - 6, 6, d - 6], '#475569');
  b.box([0, 6 + h / 2, 0], [w, h, d], body);
  // Freezer and main doors with a seam between
  b.box([0, 6 + h - 19, d / 2 + 0.6], [w - 4, 34, 1.2], ['#7dd3fc', '#38bdf8', '#7dd3fc']);
  b.box([0, 6 + (h - 40) / 2 + 1, d / 2 + 0.6], [w - 4, h - 44, 1.2], ['#7dd3fc', '#38bdf8', '#7dd3fc']);
  for (const y of [6 + h - 19, 6 + h - 56]) b.box([w / 2 - 8, y, d / 2 + 2.4], [2.4, 18, 2.4], '#f8fafc');
  // Magnets
  b.disc([-10, 6 + h - 70, d / 2 + 1.3], 3, '#f472b6', 12);
  b.disc([2, 6 + h - 84, d / 2 + 1.3], 2.6, '#facc15', 12);
  b.box([-6, 6 + h - 96, d / 2 + 1.3], [12, 8, 0.3], '#fef9c3');
  return { payload: b.build('Fridge') };
}

function oven(): OfficialModel {
  const b = new SnoBuilder();
  // Counter height, like the small cabinet it stands beside, and deep enough to sit close to the wall
  const w = 46, h = 40, d = 48;
  const top = 6 + h;
  const body: [string, string, string] = ['#fef3c7', '#fde68a', '#fffbeb'];
  const steel = '#94a3b8';
  b.box([0, 3, 0], [w - 6, 6, d - 6], '#475569');
  b.box([0, 6 + h / 2, 0], [w, h, d], body);
  // Oven door: a window and a bar handle on brackets
  b.box([0, 22, d / 2 + 0.6], [w - 6, 28, 1.2], ['#fcd34d', '#f59e0b', '#fcd34d']);
  b.box([0, 21, d / 2 + 1.4], [w - 16, 14, 0.6], ['#1f2937', '#111827', '#374151']);
  for (const x of [-w / 2 + 7, w / 2 - 7]) b.box([x, 39, d / 2 + 1.8], [2, 2, 2.4], steel);
  b.with({ at: [w / 2 - 7, 39, d / 2 + 3], rz: 90 }, () => b.cylinder([0, 0, 0], 1.1, w - 14, 8, steel));
  // Hob with four burners, one with a pot on
  b.box([0, top + 0.6, 0], [w, 1.2, d], ['#334155', '#1e293b', '#475569']);
  for (const [x, z] of [[-10, -8], [10, -8], [-10, 9], [10, 9]] as const) {
    b.cylinder([x, top + 1.2, z], 6, 0.6, 16, '#0f172a');
    b.cylinder([x, top + 1.8, z], 3, 0.4, 12, '#3f3f46');
  }
  b.with({ at: [10, top + 2.2, 9] }, () => {
    b.lathe([[0, 0], [5.5, 0], [6, 6], [7, 7], [0, 7]], 12, ['#b91c1c', '#dc2626', '#ef4444', '#b91c1c']);
    b.sphere([0, 7.8, 0], 1.1, '#1f2937', 6, 4);
  });
  // Low back panel with the knobs
  b.box([0, top + 5, -d / 2 + 2], [w, 8, 4], body);
  for (const x of [-15, -5, 5, 15]) {
    b.with({ at: [x, top + 5, -d / 2 + 4], rx: 90 }, () => b.cylinder([0, 0, 0], 1.6, 1.4, 10, '#1f2937'));
    b.box([x, top + 5.8, -d / 2 + 5.6], [0.5, 1.2, 0.4], '#f8fafc');
  }
  return { payload: b.build('Oven') };
}

function bathtub(): OfficialModel {
  const b = new SnoBuilder();
  const w = 110, d = 62, h = 44;
  const white: [string, string, string] = ['#ffffff', '#e2e8f0', '#f8fafc'];
  for (const x of [-w / 2 + 12, w / 2 - 12]) for (const z of [-d / 2 + 10, d / 2 - 10]) b.sphere([x, 4, z], 4, '#fbbf24', 8, 4);
  b.box([0, 8 + h / 2, 0], [w, h, d], white);
  // Water, sunk below the rim, and a rim on top
  b.box([0, 8 + h - 6, 0], [w - 10, 1, d - 10], ['#7dd3fc', '#7dd3fc', '#7dd3fc']);
  b.box([0, 8 + h + 1, -d / 2 + 2.5], [w, 2, 5], white);
  b.box([0, 8 + h + 1, d / 2 - 2.5], [w, 2, 5], white);
  b.box([-w / 2 + 2.5, 8 + h + 1, 0], [5, 2, d], white);
  b.box([w / 2 - 2.5, 8 + h + 1, 0], [5, 2, d], white);
  // Bubbles and a duck
  for (const [x, z, r] of [[-20, -8, 6], [-10, 4, 8], [4, -6, 5], [16, 8, 7], [26, -4, 5]] as const) b.sphere([x, 8 + h - 4, z], r, '#f0f9ff', 8, 5);
  b.sphere([-34, 8 + h - 1, 6], [5, 4, 4], '#facc15', 8, 5);
  b.sphere([-37, 8 + h + 4, 6], 3, '#facc15', 8, 5);
  b.box([-40.5, 8 + h + 3.5, 6], [3, 1.2, 2], '#f97316');
  // Tap
  b.cylinder([w / 2 - 8, 8 + h, 0], 1.6, 12, 8, '#94a3b8');
  b.with({ at: [w / 2 - 8, 8 + h + 12, 0], rz: 90 }, () => b.cylinder([0, 0, 0], 1.4, 8, 8, '#94a3b8'));
  return { payload: b.build('Bathtub') };
}

function toybox(): OfficialModel {
  const b = new SnoBuilder();
  const w = 54, h = 32, d = 36;
  b.box([0, h / 2, 0], [w, h, d], ['#f87171', '#ef4444', '#fca5a5']);
  b.box([0, h / 2, d / 2 + 0.4], [w - 8, 4, 0.8], '#fde047');
  b.box([0, h / 2 + 8, d / 2 + 0.4], [w - 8, 4, 0.8], '#60a5fa');
  // Lid propped open
  b.with({ at: [0, h, -d / 2], rx: -60 }, () => b.box([0, 1.5, d / 2], [w + 2, 3, d + 2], ['#fb7185', '#f43f5e', '#fda4af']));
  // Toys poking out
  b.sphere([-12, h + 2, 4], 8, '#22c55e', 12, 6);
  b.with({ at: [10, h - 4, 0], rz: -15 }, () => b.box([0, 6, 0], [10, 12, 10], ['#a78bfa', '#8b5cf6', '#c4b5fd']));
  b.sphere([20, h + 1, 8], [4, 5, 4], '#d97706', 8, 5);
  return { payload: b.build('Toy Box') };
}

function wardrobe(): OfficialModel {
  const b = new SnoBuilder();
  const w = 70, h = 120, d = 34;
  for (const x of [-w / 2 + 4, w / 2 - 4]) for (const z of [-d / 2 + 4, d / 2 - 4]) b.cylinder([x, 0, z], 1.6, 6, 6, '#44403c');
  b.box([0, 6 + h / 2, 0], [w, h, d], ['#d6a77a', '#b08968', '#e6c39f']);
  b.box([-w / 4, 6 + h / 2 + 8, d / 2 + 0.4], [w / 2 - 3, h - 26, 0.8], '#c8956c');
  b.box([w / 4, 6 + h / 2 + 8, d / 2 + 0.4], [w / 2 - 3, h - 26, 0.8], '#c8956c');
  b.box([0, 12, d / 2 + 0.4], [w - 4, 10, 0.8], '#c8956c');
  for (const x of [-3, 3]) b.box([x, 6 + h / 2 + 8, d / 2 + 1.6], [1.2, 12, 1.6], BRASS);
  b.box([0, 6 + h + 1.5, 0], [w + 4, 3, d + 4], '#a47148');
  return { payload: b.build('Wardrobe') };
}

// ─── Bathroom ─────────────────────────────────────────────────────────────────

function sink(): OfficialModel {
  const b = new SnoBuilder();
  const white: [string, string, string] = ['#ffffff', '#e2e8f0', '#f8fafc'];
  b.lathe([[0, 0], [10, 0], [7, 5], [6, 54], [8, 61], [0, 61]], 14, ['#f1f5f9', '#e2e8f0', '#f8fafc', '#ffffff', '#ffffff']);
  b.box([0, 66, 0], [54, 10, 40], white);
  b.box([0, 71.2, 3], [44, 0.6, 28], '#bae6fd');
  b.cylinder([0, 71, -15], 1.6, 10, 8, '#94a3b8');
  b.with({ at: [0, 80, -15], rx: 90 }, () => b.cylinder([0, 0, 0], 1.2, 9, 8, '#94a3b8'));
  for (const x of [-12, 12]) b.box([x, 72, -15], [4, 1.6, 4], '#94a3b8');
  b.sphere([20, 73, 10], [3.5, 2, 3], '#f9a8d4', 8, 4);
  b.cylinder([-20, 71, 10], 2.4, 9, 10, '#fbbf24');
  return { payload: b.build('Sink') };
}

function mirror(): OfficialModel {
  const b = new SnoBuilder();
  const w = 38, h = 50;
  b.with({ at: [0, h / 2 + 8, 0] }, () => {
    b.box([0, 0, 0.8], [w, h, 1.6], ['#e2e8f0', '#cbd5e1', '#cbd5e1']);
    b.box([0, 0, 1.7], [w - 6, h - 6, 0.3], ['#bfdbfe', '#bfdbfe', '#bfdbfe']);
    b.polygon([[-w / 2 + 6, h / 2 - 8, 1.9], [-w / 2 + 10, h / 2 - 8, 1.9], [-w / 2 + 16, h / 2 - 22, 1.9], [-w / 2 + 12, h / 2 - 22, 1.9]], '#eff6ff');
  });
  // Little shelf under it with a cup and toothbrush
  b.box([0, 3, 4], [w - 6, 2, 8], ['#f1f5f9', '#e2e8f0', '#ffffff']);
  b.cylinder([-8, 4, 4], 2.6, 7, 10, '#5eead4');
  b.with({ at: [-8, 6, 4], rz: 12 }, () => b.box([0, 4, 0], [0.8, 9, 0.8], '#f472b6'));
  b.sphere([8, 6, 4], [3, 2.4, 3], '#fde68a', 8, 4);
  return { payload: b.build('Mirror') };
}

function towelRack(): OfficialModel {
  const b = new SnoBuilder();
  const w = 52;
  for (const x of [-w / 2 + 2, w / 2 - 2]) b.box([x, 30, 3], [2.4, 4, 6], '#94a3b8');
  b.with({ at: [-w / 2 + 2, 30, 6] , rz: -90 }, () => b.cylinder([0, 0, 0], 1, w - 4, 8, '#cbd5e1'));
  b.box([-11, 21, 6.5], [18, 20, 3], ['#7dd3fc', '#38bdf8', '#bae6fd']);
  b.box([-11, 15, 8.1], [18, 2, 0.3], '#ffffff');
  b.box([11, 19, 7], [16, 24, 3], ['#f9a8d4', '#f472b6', '#fbcfe8']);
  b.box([11, 11, 8.6], [16, 2, 0.3], '#ffffff');
  return { payload: b.build('Towel Rack') };
}

// ─── Missing objects ──────────────────────────────────────────────────────────

let missing: OfficialModel | undefined;

/**
 * A taped-up cardboard box, standing in (while decorating) for a 3D object
 * that couldn't be loaded, so it can still be picked up and put away.
 */
export function missingObjectModel(): OfficialModel {
  if (missing) return missing;
  const b = new SnoBuilder();
  const w = 40, h = 32, d = 40;
  b.box([0, h / 2, 0], [w, h, d], ['#d6b48a', '#c49a6c', '#e2c49c']);
  b.box([0, h + 0.2, 0], [6, 0.4, d + 0.4], '#a8a29e');
  b.box([0, h / 2 + 4, d / 2 + 0.2], [14, 14, 0.4], '#f5f5f4');
  missing = { payload: b.build('Missing object') };
  return missing;
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

const MODELS: Record<string, () => OfficialModel> = {
  'official:fridge': fridge,
  'official:oven': oven,
  'official:bathtub': bathtub,
  'official:toybox': toybox,
  'official:wardrobe': wardrobe,
  'official:sink': sink,
  'official:mirror': mirror,
  'official:towel-rack': towelRack,
  'official:plant-small': plantSmall,
  'official:plant-tall': plantTall,
  'official:plant-cactus': plantCactus,
  'official:plant-fern': plantFern,
  'official:plant-hanging': plantHanging,
  'official:lamp-floor': lampFloor,
  'official:lamp-table': lampTable,
  'official:lamp-wall': lampWall,
  'official:lamp-string': lampString,
  'official:rug-round': rugRound,
  'official:rug-rectangle': rugRectangle,
  'official:rug-runner': rugRunner,
  'official:rug-paw': rugPaw,
  'official:shelf-wall': shelfWall,
  'official:shelf-floating': shelfFloating,
  'official:shelf-books': shelfBooks,
  'official:cabinet-small': cabinetSmall,
  'official:counter': counter,
  'official:table-side': tableSide,
  'official:bed-single': bedSingle,
  'official:bed-round': bedRound,
  'official:bed-cushion': bedCushion,
  'official:bed-basket': bedBasket,
  'official:clock-wall': () => analogWallClock('Wall Clock', '#92400e', '#fffbeb', '#1c1917'),
  'official:clock-wall-modern': () => analogWallClock('Modern Clock', '#18181b', '#fafafa', '#18181b'),
  'official:clock-wall-cute': () => analogWallClock('Cute Clock', '#f472b6', '#fdf2f8', '#831843', (b) => {
    b.sphere([-11, 12, 0], [4, 4, 2], '#f472b6', 8, 4);
    b.sphere([11, 12, 0], [4, 4, 2], '#f472b6', 8, 4);
  }),
  'official:clock-table': clockTableAnalog,
  'official:clock-alarm': clockAlarm,
  'official:clock-bedside': () => digitalClock('Bedside Clock', 22, 11, 8, '#27272a', '#0c0a09', '#f87171', false),
  'official:clock-table-digital': () => digitalClock('Digital Clock', 20, 10, 6, '#e7e5e4', '#1c1917', '#4ade80', false),
  'official:clock-wall-digital': () => digitalClock('Digital Wall Clock', 32, 14, 3, '#3f3f46', '#09090b', '#38bdf8', true),
  'official:clock-wall-flip': () => digitalClock('Flip Clock', 30, 15, 4, '#27272a', '#18181b', '#fafafa', true, true),
  'official:picture-frame': () => frame('Picture Frame', 24, 30, 3, '#92400e', '#78350f'),
  'official:picture-frame-gold': () => frame('Gold Frame', 26, 32, 3.6, '#eab308', '#ca8a04'),
  'official:picture-frame-square': () => frame('Square Frame', 28, 28, 3, '#18181b', '#27272a'),
  'official:picture-frame-oval': () => frame('Oval Frame', 22, 28, 3, '#d4a373', '#b08968', true),
};

const cache = new Map<string, OfficialModel>();

/** The official model for a furniture ID, or undefined for unknown IDs. */
export function getOfficialModel(id: string): OfficialModel | undefined {
  const cached = cache.get(id);
  if (cached) return cached;
  const make = MODELS[id];
  if (!make) return undefined;
  const model = make();
  cache.set(id, model);
  return model;
}

/** Every modelled official ID (for tests). */
export const OFFICIAL_MODEL_IDS = Object.keys(MODELS);
