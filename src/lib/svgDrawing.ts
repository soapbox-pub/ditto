/**
 * SVG drawing utilities — pure functions for converting freehand strokes
 * into compact SVG markup.
 */

export interface Stroke {
  points: [number, number][];
  color: string;
  width: number;
}

// ---------------------------------------------------------------------------
// Point simplification (Ramer-Douglas-Peucker)
// ---------------------------------------------------------------------------

/** Perpendicular distance from point p to line segment a-b */
function perpendicularDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ramer-Douglas-Peucker simplification. Epsilon ~1-2 works well for a 300-unit viewBox. */
export function simplifyPoints(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const last = points.length - 1;
  for (let i = 1; i < last; i++) {
    const d = perpendicularDist(points[i], points[0], points[last]);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }

  if (maxDist <= epsilon) return [points[0], points[last]];

  const left = simplifyPoints(points.slice(0, maxIdx + 1), epsilon);
  const right = simplifyPoints(points.slice(maxIdx), epsilon);
  return [...left.slice(0, -1), ...right];
}

// ---------------------------------------------------------------------------
// Path generation
// ---------------------------------------------------------------------------

/** Round a number to 1 decimal place to reduce SVG string size */
function r(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Build an SVG path d-attribute with quadratic bezier smoothing */
export function pointsToPath(points: [number, number][]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    return `M${r(points[0][0])},${r(points[0][1])}l0,0`;
  }
  if (points.length === 2) {
    return `M${r(points[0][0])},${r(points[0][1])}L${r(points[1][0])},${r(points[1][1])}`;
  }

  let d = `M${r(points[0][0])},${r(points[0][1])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    d += `Q${r(cx)},${r(cy)},${r((cx + nx) / 2)},${r((cy + ny) / 2)}`;
  }
  const last = points[points.length - 1];
  d += `L${r(last[0])},${r(last[1])}`;
  return d;
}

// ---------------------------------------------------------------------------
// Bounding box
// ---------------------------------------------------------------------------

export function computeBBox(strokes: Stroke[]): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const stroke of strokes) {
    const hw = stroke.width / 2;
    for (const [px, py] of stroke.points) {
      if (px - hw < minX) minX = px - hw;
      if (py - hw < minY) minY = py - hw;
      if (px + hw > maxX) maxX = px + hw;
      if (py + hw > maxY) maxY = py + hw;
    }
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ---------------------------------------------------------------------------
// SVG serialization
// ---------------------------------------------------------------------------

const PADDING = 8;
const SIMPLIFY_EPSILON = 1.5;

/** Matches hex colors (#rgb, #rrggbb, #rrggbbaa) and common CSS named colors. */
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Sanitize a color value for safe SVG attribute interpolation. Returns a fallback for invalid values. */
function safeColor(color: string): string {
  return HEX_COLOR_RE.test(color) ? color : '#000000';
}

/** Clamp stroke width to a safe finite number. */
function safeWidth(width: number): number {
  const n = Number(width);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : 4;
}

/** Generate a tightly-cropped SVG string from strokes. Points are simplified to reduce size. */
export function strokesToSvg(strokes: Stroke[]): string | null {
  if (strokes.length === 0) return null;
  const bbox = computeBBox(strokes);
  if (!bbox || bbox.w < 1 || bbox.h < 1) return null;

  const vx = r(Math.max(0, bbox.x - PADDING));
  const vy = r(Math.max(0, bbox.y - PADDING));
  const vw = r(bbox.w + PADDING * 2);
  const vh = r(bbox.h + PADDING * 2);

  const paths = strokes.map((s) => {
    const simplified = simplifyPoints(s.points, SIMPLIFY_EPSILON);
    return `<path d="${pointsToPath(simplified)}" fill="none" stroke="${safeColor(s.color)}" stroke-width="${safeWidth(s.width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}">${paths.join('')}</svg>`;
}
