/**
 * Lays emoji frames out as a garland along a rounded rectangle, evenly spaced
 * for whatever size the letter is, so corners and edges fill alike. Emoji are
 * drawn from a shuffled bag, so each one shows up as often as the others and
 * never next to itself, with a little seeded wobble in size, angle and
 * placement. The same frame always lays out the same way.
 */

export interface FrameEmoji {
  emoji: string;
  /** Centre, in px from the frame's top left */
  x: number;
  y: number;
  /** Font size in px */
  size: number;
  /** Rotation in degrees */
  rot: number;
}

export interface FrameRow {
  /** Distance of the row's centre line from the frame's edge */
  inset: number;
  /** Corner radius of the frame's outer edge */
  radius: number;
  /** Target distance between emoji centres */
  spacing: number;
  /** Emoji font size */
  size: number;
  /** Shifts the row along by this fraction of a step, to stagger it against another */
  phase?: number;
}

/** Small seeded PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Endless emoji from shuffled bags, never the same twice running. */
function emojiBag(emojis: string[], rand: () => number): () => string {
  let bag: string[] = [];
  let last: string | undefined;
  return () => {
    if (bag.length === 0) {
      bag = [...emojis];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      // The new bag mustn't start with the one the last bag ended on
      if (bag.length > 1 && bag[bag.length - 1] === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    }
    last = bag.pop()!;
    return last;
  };
}

/** Point and outward normal at distance `s` along a rounded rect, starting at the top edge's left end. */
function pointAt(s: number, x0: number, y0: number, w: number, h: number, r: number) {
  const sw = w - 2 * r;
  const sh = h - 2 * r;
  const arc = (Math.PI / 2) * r;
  const segs: [number, (u: number) => [number, number, number]][] = [
    [sw, (u) => [x0 + r + u, y0, -Math.PI / 2]],
    [arc, (u) => corner(x0 + w - r, y0 + r, -Math.PI / 2 + u / r)],
    [sh, (u) => [x0 + w, y0 + r + u, 0]],
    [arc, (u) => corner(x0 + w - r, y0 + h - r, u / r)],
    [sw, (u) => [x0 + w - r - u, y0 + h, Math.PI / 2]],
    [arc, (u) => corner(x0 + r, y0 + h - r, Math.PI / 2 + u / r)],
    [sh, (u) => [x0, y0 + h - r - u, Math.PI]],
    [arc, (u) => corner(x0 + r, y0 + r, Math.PI + u / r)],
  ];
  function corner(cx: number, cy: number, a: number): [number, number, number] {
    return [cx + r * Math.cos(a), cy + r * Math.sin(a), a];
  }
  for (const [len, at] of segs) {
    if (s <= len) return at(s);
    s -= len;
  }
  return segs[0][1](0);
}

export function layoutFrame(
  width: number,
  height: number,
  emojis: string[],
  seedKey: string,
  rows: FrameRow[],
): FrameEmoji[] {
  if (width <= 0 || height <= 0 || emojis.length === 0) return [];
  const rand = rng(hash(seedKey));
  const next = emojiBag(emojis, rand);
  const items: FrameEmoji[] = [];

  for (const row of rows) {
    const d = row.inset;
    const w = width - 2 * d;
    const h = height - 2 * d;
    if (w <= 0 || h <= 0) continue;
    const r = Math.min(Math.max(row.radius - d, 0), w / 2, h / 2);
    const length = 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
    const n = Math.max(4, Math.round(length / row.spacing));
    const step = length / n;
    // Start half a step in, so the top-left corner isn't always where the row begins
    const start = step * (0.5 + (row.phase ?? 0));

    for (let i = 0; i < n; i++) {
      const s = (start + i * step + (rand() - 0.5) * step * 0.3 + length) % length;
      const [x, y, normal] = pointAt(s, d, d, w, h, r);
      const out = (rand() - 0.5) * row.size * 0.15;
      items.push({
        emoji: next(),
        x: x + Math.cos(normal) * out,
        y: y + Math.sin(normal) * out,
        size: row.size * (0.85 + rand() * 0.25),
        rot: (rand() - 0.5) * 40,
      });
    }
  }
  return items;
}
