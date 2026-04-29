import { useId, useMemo } from 'react';

import { cn } from '@/lib/utils';
import { starByHip } from '@/lib/starCatalog';

/**
 * Renders a custom constellation as an SVG star-map.
 *
 * This component is code-split via `lazy()` from `ConstellationContent`:
 * the Hipparcos star catalog it imports is ~1.3 MB of JSON and must never
 * ship in the main bundle.
 *
 * The figure is gnomonically projected onto a tangent plane centered on the
 * centroid of its stars (on the unit sphere) and then normalized to fit the
 * SVG viewBox with equal aspect, so shapes are never distorted. Stars are
 * sized by apparent magnitude, with the brightest few getting a soft glow
 * to evoke a real sky.
 *
 * Adapted from the `ConstellationPreview` component in the Birdstar
 * reference client.
 */

export interface ConstellationStarMapProps {
  edges: ReadonlyArray<readonly [number, number]>;
  title?: string;
  className?: string;
}

const DEG = Math.PI / 180;
const HOUR = (15 * Math.PI) / 180; // 1h = 15°

interface ResolvedStar {
  hip: number;
  ra: number; // hours
  dec: number; // degrees
  mag: number;
}

interface ProjectedPoint {
  hip: number;
  x: number;
  y: number;
  r: number;
}

interface ProjectedEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface BackgroundStar {
  x: number;
  y: number;
  r: number;
  o: number;
}

interface ProjectionResult {
  points: Map<number, ProjectedPoint>;
  edges: ProjectedEdge[];
  backgroundStars: BackgroundStar[];
}

export function ConstellationStarMap({ edges, title, className }: ConstellationStarMapProps) {
  // A stable unique id keeps multiple previews on the page from colliding on
  // the shared <filter> id.
  const rawId = useId();
  const uid = rawId.replace(/:/g, '');
  const glowId = `cm-glow-${uid}`;

  const projected = useMemo(() => project(edges), [edges]);

  if (!projected || projected.points.size === 0) {
    return (
      <div
        className={cn(
          'flex size-full items-center justify-center rounded-xl ring-1 ring-border bg-[radial-gradient(ellipse_at_50%_40%,#1e1b4b_0%,#0b1026_55%,#020617_100%)] text-xs text-white/60',
          className,
        )}
        role="img"
        aria-label={title ?? 'Constellation preview'}
      >
        No recognizable stars.
      </div>
    );
  }

  const { points, edges: projEdges, backgroundStars } = projected;

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden rounded-xl ring-1 ring-border',
        'bg-[radial-gradient(ellipse_at_50%_40%,#1e1b4b_0%,#0b1026_55%,#020617_100%)]',
        className,
      )}
      role="img"
      aria-label={title ?? 'Constellation preview'}
    >
      {/* Background field stars — cover the whole container regardless of
          aspect ratio, so corners never look bare. */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
        aria-hidden
      >
        <g fill="rgba(255, 255, 255, 0.5)">
          {backgroundStars.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.o} />
          ))}
        </g>
      </svg>

      {/* Figure — preserves aspect so stick-figures never distort. */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 size-full"
      >
        <defs>
          <filter
            id={glowId}
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation="1.1" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Edges */}
        <g
          stroke="rgba(253, 230, 138, 0.8)"
          strokeWidth={0.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          pointerEvents="none"
        >
          {projEdges.map((e, i) => (
            <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
          ))}
        </g>

        {/* Figure stars with soft glow */}
        <g fill="rgb(254, 243, 199)" filter={`url(#${glowId})`}>
          {Array.from(points.values()).map((p) => (
            <circle key={p.hip} cx={p.x} cy={p.y} r={p.r} pointerEvents="none" />
          ))}
        </g>
      </svg>
    </div>
  );
}

function project(edges: ReadonlyArray<readonly [number, number]>): ProjectionResult | null {
  // Collect unique stars referenced by the figure. Unknown HIP numbers are
  // silently dropped per the NIP's validation rules.
  const stars = new Map<number, ResolvedStar>();
  for (const [a, b] of edges) {
    if (!stars.has(a)) {
      const s = starByHip(a);
      if (s) stars.set(a, { hip: s.hip, ra: s.ra, dec: s.dec, mag: s.mag });
    }
    if (!stars.has(b)) {
      const s = starByHip(b);
      if (s) stars.set(b, { hip: s.hip, ra: s.ra, dec: s.dec, mag: s.mag });
    }
  }
  if (stars.size === 0) return null;

  // Mean unit-vector as the projection tangent point — handles wrap-around
  // at RA=0h/24h and the poles without special-casing.
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (const s of stars.values()) {
    const raRad = s.ra * HOUR;
    const decRad = s.dec * DEG;
    const cosDec = Math.cos(decRad);
    mx += cosDec * Math.cos(raRad);
    my += cosDec * Math.sin(raRad);
    mz += Math.sin(decRad);
  }
  const norm = Math.hypot(mx, my, mz) || 1;
  mx /= norm;
  my /= norm;
  mz /= norm;

  const centerDec = Math.asin(Math.max(-1, Math.min(1, mz)));
  const centerRa = Math.atan2(my, mx);
  const sinC = Math.sin(centerDec);
  const cosC = Math.cos(centerDec);

  // Gnomonic projection onto a tangent plane at (centerRa, centerDec).
  const raw = new Map<number, { x: number; y: number; mag: number }>();
  for (const s of stars.values()) {
    const ra = s.ra * HOUR;
    const dec = s.dec * DEG;
    const cosDec = Math.cos(dec);
    const sinDec = Math.sin(dec);
    const dRa = ra - centerRa;
    const cosDRa = Math.cos(dRa);
    const sinDRa = Math.sin(dRa);
    const cosDistance = sinC * sinDec + cosC * cosDec * cosDRa;
    if (cosDistance <= 1e-6) continue;
    const x = (cosDec * sinDRa) / cosDistance;
    const y = (cosC * sinDec - sinC * cosDec * cosDRa) / cosDistance;
    // Flip x so RA increases to the left (conventional sky orientation).
    raw.set(s.hip, { x: -x, y, mag: s.mag });
  }
  if (raw.size === 0) return null;

  // Bounding box.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of raw.values()) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const PADDING = 14;
  const AVAILABLE = 100 - PADDING * 2;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const span = Math.max(spanX, spanY);
  const scale = span > 1e-9 ? AVAILABLE / span : 0;
  const offsetX = (AVAILABLE - spanX * scale) / 2 + PADDING;
  const offsetY = (AVAILABLE - spanY * scale) / 2 + PADDING;

  const points = new Map<number, ProjectedPoint>();
  for (const [hip, p] of raw) {
    const x = (p.x - minX) * scale + offsetX;
    // Invert SVG y so north-ish stars sit on top.
    const y = 100 - ((p.y - minY) * scale + offsetY);
    points.set(hip, { hip, x, y, r: magToRadius(p.mag) });
  }

  const projEdges: ProjectedEdge[] = [];
  for (const [a, b] of edges) {
    const pa = points.get(a);
    const pb = points.get(b);
    if (!pa || !pb) continue;
    projEdges.push({ x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y });
  }

  // Deterministic scatter of faint background stars seeded from the edge
  // list, so the same figure always renders identically.
  const backgroundStars = makeBackgroundStars(edges, points);

  return { points, edges: projEdges, backgroundStars };
}

function makeBackgroundStars(
  edges: ReadonlyArray<readonly [number, number]>,
  figure: Map<number, ProjectedPoint>,
): BackgroundStar[] {
  let seed = 2166136261;
  for (const [a, b] of edges) {
    seed ^= a * 16777619;
    seed = Math.imul(seed, 16777619);
    seed ^= b * 2246822519;
    seed = Math.imul(seed, 16777619);
  }
  const rand = mulberry32(seed >>> 0);

  const MIN_DIST = 5; // clearance from figure stars (viewBox units)
  const out: BackgroundStar[] = [];
  const figurePts = Array.from(figure.values());
  let attempts = 0;
  while (out.length < 22 && attempts < 120) {
    attempts++;
    const x = rand() * 100;
    const y = rand() * 100;
    let tooClose = false;
    for (const p of figurePts) {
      if (Math.hypot(p.x - x, p.y - y) < MIN_DIST) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    out.push({ x, y, r: 0.2 + rand() * 0.5, o: 0.3 + rand() * 0.55 });
  }
  return out;
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Map apparent magnitude to a preview dot radius in viewBox units.
 * Brighter stars (lower magnitude) get larger dots, clamped to keep mag~6
 * stars visible and mag~0 stars from dominating the thumbnail.
 */
function magToRadius(mag: number): number {
  const r = 2.3 - 0.25 * mag;
  if (r < 0.8) return 0.8;
  if (r > 2.4) return 2.4;
  return r;
}
