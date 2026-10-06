/**
 * SNO builder — compose Simple Nostr Objects (kind 33331 payloads) from
 * low-poly primitives.
 *
 * Ditto's official Blobbi furniture is modelled with this and serialized as
 * real SNO v2 JSON (an inline palette, integer lattice + ticks, run-length
 * face colors), so it renders through the same path as objects people publish
 * and could be published itself.
 *
 * Coordinates are model units, Y up, +Z toward the viewer (the SNO v2 frame).
 */

import { TICKS_PER_UNIT } from '@/lib/sno';

type Vec3 = [number, number, number];

/** Row-major 3×4 affine matrix. */
type Mat = [number, number, number, number, number, number, number, number, number, number, number, number];

const IDENTITY: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

function multiply(a: Mat, b: Mat): Mat {
  const out = new Array(12) as Mat;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      out[r * 4 + c] =
        a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + (c === 3 ? a[r * 4 + 3] : 0);
    }
  }
  return out;
}

function apply(m: Mat, [x, y, z]: Vec3): Vec3 {
  return [
    m[0] * x + m[1] * y + m[2] * z + m[3],
    m[4] * x + m[5] * y + m[6] * z + m[7],
    m[8] * x + m[9] * y + m[10] * z + m[11],
  ];
}

const DEG = Math.PI / 180;

/** A local transform: translate, then rotate X, Y, Z (degrees), then scale. */
export interface Transform {
  at?: Vec3;
  rx?: number;
  ry?: number;
  rz?: number;
  scale?: number | Vec3;
}

function toMatrix({ at = [0, 0, 0], rx = 0, ry = 0, rz = 0, scale = 1 }: Transform): Mat {
  const [sx, sy, sz] = typeof scale === 'number' ? [scale, scale, scale] : scale;
  const t: Mat = [1, 0, 0, at[0], 0, 1, 0, at[1], 0, 0, 1, at[2]];
  const cx = Math.cos(rx * DEG), sxr = Math.sin(rx * DEG);
  const cy = Math.cos(ry * DEG), syr = Math.sin(ry * DEG);
  const cz = Math.cos(rz * DEG), szr = Math.sin(rz * DEG);
  const mx: Mat = [1, 0, 0, 0, 0, cx, -sxr, 0, 0, sxr, cx, 0];
  const my: Mat = [cy, 0, syr, 0, 0, 1, 0, 0, -syr, 0, cy, 0];
  const mz: Mat = [cz, -szr, 0, 0, szr, cz, 0, 0, 0, 0, 1, 0];
  const s: Mat = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0];
  return multiply(t, multiply(mz, multiply(my, multiply(mx, s))));
}

/** SNO v2 payload as published in an event's content. */
export interface SnoPayload {
  v: 2;
  name: string;
  unit: number;
  mode: 'solid';
  palette: [number, number, number][];
  vertices: Vec3[];
  ticks: Vec3[];
  colors: number[];
  faces: Vec3[];
  facecolors: number[];
}

/** Multiplier on round parts' segment counts. */
const DETAIL = 2;

/** Sides a lathe of `segments` gets once built, so overlays can match its facets. */
export function latheSegments(segments: number): number {
  return Math.min(48, Math.round(segments * DETAIL));
}

export class SnoBuilder {
  private positions: Vec3[] = [];
  private faces: Vec3[] = [];
  private faceColors: number[] = [];
  private palette: [number, number, number][] = [];
  private paletteIndex = new Map<string, number>();
  private stack: Mat[] = [IDENTITY];

  /** Palette index for a `#rrggbb` color. */
  private color(hex: string): number {
    const key = hex.toLowerCase();
    let index = this.paletteIndex.get(key);
    if (index === undefined) {
      const n = parseInt(key.slice(1), 16);
      index = this.palette.length;
      this.palette.push([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
      this.paletteIndex.set(key, index);
    }
    return index;
  }

  private get matrix(): Mat {
    return this.stack[this.stack.length - 1];
  }

  /** Draw `fn` inside a local transform. */
  with(transform: Transform, fn: () => void): this {
    this.stack.push(multiply(this.matrix, toMatrix(transform)));
    fn();
    this.stack.pop();
    return this;
  }

  private vertex(p: Vec3): number {
    this.positions.push(apply(this.matrix, p));
    return this.positions.length - 1;
  }

  private tri(a: number, b: number, c: number, color: number) {
    this.faces.push([a, b, c]);
    this.faceColors.push(color);
  }

  /** A flat polygon (convex, counter-clockwise seen from its front). */
  polygon(points: Vec3[], hex: string): this {
    const color = this.color(hex);
    const ids = points.map((p) => this.vertex(p));
    for (let i = 1; i < ids.length - 1; i++) this.tri(ids[0], ids[i], ids[i + 1], color);
    return this;
  }

  /** Axis-aligned box centered at `center`. `colors` is one color, or [front, sides, top]. */
  box(center: Vec3, size: Vec3, hex: string | [string, string, string]): this {
    const [front, side, top] = typeof hex === 'string' ? [hex, hex, hex] : hex;
    const [cx, cy, cz] = center;
    const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
    const v = (x: number, y: number, z: number): Vec3 => [cx + x * hx, cy + y * hy, cz + z * hz];
    this.polygon([v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)], front);
    this.polygon([v(1, -1, -1), v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1)], side);
    this.polygon([v(1, -1, 1), v(1, -1, -1), v(1, 1, -1), v(1, 1, 1)], side);
    this.polygon([v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1)], side);
    this.polygon([v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1), v(-1, 1, -1)], top);
    this.polygon([v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1)], side);
    return this;
  }

  /**
   * Revolve a profile of `[radius, y]` points about the Y axis. `colors` gives
   * one color per profile segment (the last repeats). Ends at radius 0 close.
   */
  lathe(profile: [number, number][], segments: number, colors: string | string[]): this {
    segments = latheSegments(segments);
    const palette = (Array.isArray(colors) ? colors : [colors]).map((c) => this.color(c));
    const rings: number[][] = profile.map(([r, y]) => {
      if (r === 0) return [this.vertex([0, y, 0])];
      const ring: number[] = [];
      for (let s = 0; s < segments; s++) {
        const a = (s / segments) * Math.PI * 2;
        ring.push(this.vertex([Math.sin(a) * r, y, Math.cos(a) * r]));
      }
      return ring;
    });
    for (let i = 0; i < rings.length - 1; i++) {
      const a = rings[i];
      const b = rings[i + 1];
      const color = palette[Math.min(i, palette.length - 1)];
      for (let s = 0; s < segments; s++) {
        const n = (s + 1) % segments;
        if (a.length === 1 && b.length > 1) this.tri(a[0], b[n], b[s], color);
        else if (b.length === 1 && a.length > 1) this.tri(a[s], a[n], b[0], color);
        else if (a.length > 1 && b.length > 1) {
          this.tri(a[s], a[n], b[n], color);
          this.tri(a[s], b[n], b[s], color);
        }
      }
    }
    return this;
  }

  /** Cylinder (or frustum) standing on `base`. */
  cylinder(base: Vec3, radius: number, height: number, segments: number, hex: string | string[], radiusTop = radius): this {
    return this.with({ at: base }, () => {
      this.lathe([[0, 0], [radius, 0], [radiusTop, height], [0, height]], segments, Array.isArray(hex) ? hex : [hex, hex, hex]);
    });
  }

  /** Low-poly ellipsoid centered at `center`. */
  sphere(center: Vec3, radius: Vec3 | number, hex: string, segments = 10, rings = 6): this {
    rings = Math.min(16, Math.round(rings * DETAIL));
    const scale: Vec3 = typeof radius === 'number' ? [radius, radius, radius] : radius;
    return this.with({ at: center, scale }, () => {
      const profile: [number, number][] = [];
      for (let i = 0; i <= rings; i++) {
        const a = (i / rings) * Math.PI;
        profile.push([i === 0 || i === rings ? 0 : Math.sin(a), -Math.cos(a)]);
      }
      this.lathe(profile, segments, hex);
    });
  }

  /** Torus in the XY plane (facing +Z), centered at `center`. */
  torus(center: Vec3, radius: number, tube: number, hex: string, segments = 24, sides = 6): this {
    const color = this.color(hex);
    const ids: number[][] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const ring: number[] = [];
      for (let j = 0; j < sides; j++) {
        const b = (j / sides) * Math.PI * 2;
        const r = radius + Math.cos(b) * tube;
        ring.push(this.vertex([center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r, center[2] + Math.sin(b) * tube]));
      }
      ids.push(ring);
    }
    for (let i = 0; i < segments; i++) {
      const a = ids[i];
      const b = ids[(i + 1) % segments];
      for (let j = 0; j < sides; j++) {
        const n = (j + 1) % sides;
        this.tri(a[j], b[j], b[n], color);
        this.tri(a[j], b[n], a[n], color);
      }
    }
    return this;
  }

  /** Flat disc facing +Z, centered at `center`. */
  disc(center: Vec3, radius: number | [number, number], hex: string, segments = 24): this {
    const [rx, ry] = typeof radius === 'number' ? [radius, radius] : radius;
    const points: Vec3[] = [];
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      points.push([center[0] + Math.cos(a) * rx, center[1] + Math.sin(a) * ry, center[2]]);
    }
    return this.polygon(points, hex);
  }

  /** Serialize as an SNO v2 payload. */
  build(name: string): SnoPayload {
    const vertices: Vec3[] = [];
    const ticks: Vec3[] = [];
    for (const p of this.positions) {
      const v: Vec3 = [0, 0, 0];
      const t: Vec3 = [0, 0, 0];
      for (let a = 0; a < 3; a++) {
        const total = Math.round(p[a] * TICKS_PER_UNIT);
        v[a] = Math.floor(total / TICKS_PER_UNIT);
        t[a] = total - v[a] * TICKS_PER_UNIT;
      }
      vertices.push(v);
      ticks.push(t);
    }
    // A palette needs at least two entries (§1.3a).
    if (this.palette.length < 2) this.palette.push([0, 0, 0]);
    // Vertex colors: the color of the last face that uses each vertex.
    const colors = new Array<number>(vertices.length).fill(0);
    this.faces.forEach((face, f) => face.forEach((v) => { colors[v] = this.faceColors[f]; }));
    // Run-length encode face colors (§1.4a): -N repeats the previous entry N times.
    const facecolors: number[] = [];
    for (let i = 0; i < this.faceColors.length; i++) {
      const c = this.faceColors[i];
      let run = 0;
      while (i + 1 < this.faceColors.length && this.faceColors[i + 1] === c) { run++; i++; }
      facecolors.push(c);
      if (run > 0) facecolors.push(-run);
    }
    return { v: 2, name, unit: 0, mode: 'solid', palette: this.palette, vertices, ticks, colors, faces: this.faces, facecolors };
  }
}
