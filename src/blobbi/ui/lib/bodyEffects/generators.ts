/**
 * Body Effect Generators — Dirty / Smell Redesign
 *
 * Pure functions that generate SVG markup for body-level visual effects.
 * Each generator returns SVG strings — no DOM manipulation.
 *
 * Coordinate systems by variant:
 *   - Baby:  100x100 viewBox, body roughly x: 25-75, y: 15-88
 *   - Adult: 200x200 viewBox, body varies significantly by form
 *
 * For adults, effects use detected body bounds (not hardcoded positions)
 * to correctly follow each form's actual silhouette.
 *
 * ─── Visual Design Philosophy ────────────────────────────────────────────
 *
 * Dirt layer (sits ON the body):
 *   - Muddy smudges: soft organic blobs in warm brown tones
 *   - Grime spots: small clustered dots near smudges for texture
 *   - Dusty patches: large ultra-low-opacity circles for subtle tinting
 *
 * Smell layer (floats OUTSIDE the body):
 *   - Odor wisps: classic wavy S-curve "stink lines" in muted green
 *   - Stink puffs: small soft cloudlets that rise and fade
 *   - Buzzing flies: tiny dots orbiting in elliptical paths (optional)
 *
 * Style target: Tamagotchi / Pokémon status-effect readability.
 * Cute, playful, instantly recognizable — not realistic or disgusting.
 */

import type {
  DirtMarksConfig,
  StinkCloudsConfig,
  BodyEffectConfig,
  BodyPathInfo,
} from './types';

// ─── Body Path Detection ──────────────────────────────────────────────────────

/**
 * Detect the body element from the SVG and extract full bounding box.
 *
 * Strategy order:
 *   0. Explicit `data-blobbi-body="true"` marker (any element type)
 *   1. `<path>` with body gradient fill (legacy fallback)
 *   2. `<path>` after a "Body" comment (legacy fallback)
 *
 * For non-path elements (`<circle>`, `<ellipse>`, `<rect>`) detected via
 * Strategy 0, a geometrically equivalent path `d` string is synthesised
 * so that downstream consumers (anger-rise clipPath, bounds) work unchanged.
 */
export function detectBodyPath(svgText: string): BodyPathInfo | null {
  // Strategy 0: explicit marker on any element type
  const markerMatch = svgText.match(/<(path|circle|ellipse|rect)\s([^>]*data-blobbi-body="true"[^>]*)\/>/);
  if (markerMatch) {
    const tag = markerMatch[1];
    const attrs = markerMatch[2];
    return bodyInfoFromElement(tag, attrs);
  }

  // Strategy 1 (legacy fallback): path with body gradient fill
  const bodyGradientMatch = svgText.match(/<path[^>]*d="([^"]+)"[^>]*fill="url\(#[^"]*[Bb]ody[^"]*\)"[^>]*\/>/);
  if (bodyGradientMatch) {
    const pathD = bodyGradientMatch[1];
    return { pathD, ...estimatePathBounds(pathD) };
  }
  
  // Strategy 2 (legacy fallback): path after "Body" comment
  const commentMatch = svgText.match(/<!--[^>]*[Bb]ody[^>]*-->\s*<path[^>]*d="([^"]+)"/);
  if (commentMatch) {
    const pathD = commentMatch[1];
    return { pathD, ...estimatePathBounds(pathD) };
  }
  
  return null;
}

// ─── Shape-to-Path Synthesis ──────────────────────────────────────────────────

/**
 * Extract BodyPathInfo from a matched SVG element (any supported shape type).
 * For `<path>` elements the `d` attribute is used directly.
 * For primitives (`<circle>`, `<ellipse>`, `<rect>`) an equivalent path is synthesised.
 */
function bodyInfoFromElement(tag: string, attrs: string): BodyPathInfo | null {
  if (tag === 'path') {
    const d = attr(attrs, 'd');
    if (!d) return null;
    return { pathD: d, ...estimatePathBounds(d) };
  }

  if (tag === 'circle') {
    const cx = num(attrs, 'cx'), cy = num(attrs, 'cy'), r = num(attrs, 'r');
    if (cx === null || cy === null || r === null) return null;
    return circleToPathInfo(cx, cy, r, r);
  }

  if (tag === 'ellipse') {
    const cx = num(attrs, 'cx'), cy = num(attrs, 'cy');
    const rx = num(attrs, 'rx'), ry = num(attrs, 'ry');
    if (cx === null || cy === null || rx === null || ry === null) return null;
    return circleToPathInfo(cx, cy, rx, ry);
  }

  if (tag === 'rect') {
    const x = num(attrs, 'x') ?? 0, y = num(attrs, 'y') ?? 0;
    const w = num(attrs, 'width'), h = num(attrs, 'height');
    const rx = num(attrs, 'rx') ?? 0;
    if (w === null || h === null) return null;
    return rectToPathInfo(x, y, w, h, rx);
  }

  return null;
}

/** Parse a single numeric attribute from an attribute string. */
function num(attrs: string, name: string): number | null {
  const m = attrs.match(new RegExp(`${name}="([^"]+)"`));
  if (!m) return null;
  const v = parseFloat(m[1]);
  return isNaN(v) ? null : v;
}

/** Parse a string attribute value from an attribute string. */
function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`${name}="([^"]+)"`));
  return m ? m[1] : null;
}

/** Synthesise a path `d` and BodyPathInfo for a circle or ellipse. */
function circleToPathInfo(cx: number, cy: number, rx: number, ry: number): BodyPathInfo {
  // Two-arc closed path tracing the full ellipse
  const pathD = `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
  return {
    pathD,
    minX: cx - rx, maxX: cx + rx,
    minY: cy - ry, maxY: cy + ry,
    centerX: cx,
    width: rx * 2,
    height: ry * 2,
  };
}

/** Synthesise a path `d` and BodyPathInfo for a rect (with optional rx rounding). */
function rectToPathInfo(x: number, y: number, w: number, h: number, rx: number): BodyPathInfo {
  const r = Math.min(rx, w / 2, h / 2);
  let pathD: string;
  if (r > 0) {
    pathD = `M ${x + r} ${y} L ${x + w - r} ${y} A ${r} ${r} 0 0 1 ${x + w} ${y + r} L ${x + w} ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} L ${x + r} ${y + h} A ${r} ${r} 0 0 1 ${x} ${y + h - r} L ${x} ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
  } else {
    pathD = `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
  }
  return {
    pathD,
    minX: x, maxX: x + w,
    minY: y, maxY: y + h,
    centerX: x + w / 2,
    width: w,
    height: h,
  };
}

/**
 * Estimate the full bounding box of a path from its d attribute.
 * Extracts both X and Y coordinate ranges for shape-aware placement.
 */
function estimatePathBounds(pathD: string): Omit<BodyPathInfo, 'pathD'> {
  const numbers = pathD.match(/-?\d+\.?\d*/g)?.map(Number) || [];
  
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  
  for (let i = 0; i < numbers.length - 1; i += 2) {
    const x = numbers[i];
    const y = numbers[i + 1];
    
    if (x !== undefined && !isNaN(x)) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    if (y !== undefined && !isNaN(y)) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  
  if (!isFinite(minX) || !isFinite(maxX)) {
    minX = 20;
    maxX = 80;
  }
  if (!isFinite(minY) || !isFinite(maxY)) {
    minY = 10;
    maxY = 90;
  }
  
  const width = maxX - minX;
  const height = maxY - minY;
  const centerX = minX + width / 2;
  
  return { minX, maxX, minY, maxY, centerX, width, height };
}

// ─── Color Palette ────────────────────────────────────────────────────────────

/** Warm brown palette for mud/dirt — saturated enough to read, soft enough to stay cute */
const MUD_COLORS = {
  /** Light mud — main smudge fill */
  smudge: '#8b7355',
  /** Darker grime — spots and depth */
  grime: '#6b5340',
  /** Dusty haze tint */
  dust: '#7a6b55',
} as const;

/** Muted green palette for smell — reads as "stink" without being garish */
const SMELL_COLORS = {
  /** Odor wisp stroke — muted sage green */
  wisp: '#7c9a5e',
  /** Stink puff fill — lighter, more diffuse */
  puff: '#8fac6e',
  /** Fly body color */
  fly: '#4a5240',
} as const;

// ─── Muddy Smudges (replaces old dirt marks) ─────────────────────────────────

/**
 * A smudge is defined by its center, approximate radii, rotation,
 * and visual weight. The generator turns these into organic blob shapes.
 */
interface SmudgeDef {
  x: number;
  y: number;
  /** Horizontal radius of the blob */
  rx: number;
  /** Vertical radius of the blob */
  ry: number;
  /** Rotation in degrees for organic variety */
  rotate: number;
  /** Opacity multiplier (0-1) */
  weight: number;
  /** 'smudge' for lighter fill, 'grime' for darker spots */
  tone: 'smudge' | 'grime';
}

/** Baby (100x100): Fixed smudge positions on lower body, well below face */
const BABY_SMUDGES: SmudgeDef[] = [
  // Primary smudges — lower-left and lower-right body
  { x: 33, y: 77, rx: 4, ry: 2.5, rotate: 15, weight: 0.40, tone: 'smudge' },
  { x: 65, y: 75, rx: 3.5, ry: 2, rotate: -20, weight: 0.35, tone: 'smudge' },
  // Grime spots — smaller, darker, clustered near smudges
  { x: 36, y: 80, rx: 1.5, ry: 1.2, rotate: 40, weight: 0.50, tone: 'grime' },
  { x: 62, y: 78, rx: 1.2, ry: 1, rotate: -10, weight: 0.45, tone: 'grime' },
  // Additional for higher counts
  { x: 50, y: 82, rx: 3, ry: 2, rotate: 5, weight: 0.30, tone: 'smudge' },
  { x: 40, y: 83, rx: 1, ry: 0.8, rotate: 25, weight: 0.40, tone: 'grime' },
];

/**
 * Compute smudge positions relative to detected body bounds (adult).
 * Distributes smudges naturally across the lower body.
 */
function computeAdultSmudges(body: BodyPathInfo, count: number, intensity: number): SmudgeDef[] {
  const { minX, maxX, minY, width, height } = body;

  // Face region ends at ~55% down from top
  const safeY = minY + height * 0.55;

  // Scale radii with body size
  const baseR = Math.max(3, width * 0.05);

  const all: SmudgeDef[] = [
    // Primary smudges — left and right lower body near edges
    {
      x: minX + width * 0.18,
      y: safeY + height * 0.18,
      rx: baseR * 1.3, ry: baseR * 0.8,
      rotate: 25, weight: 0.40 * intensity, tone: 'smudge',
    },
    {
      x: maxX - width * 0.18,
      y: safeY + height * 0.12,
      rx: baseR * 1.1, ry: baseR * 0.7,
      rotate: -18, weight: 0.35 * intensity, tone: 'smudge',
    },
    // Grime spots — smaller darker accents near the primary smudges
    {
      x: minX + width * 0.25,
      y: safeY + height * 0.24,
      rx: baseR * 0.5, ry: baseR * 0.4,
      rotate: 40, weight: 0.50 * intensity, tone: 'grime',
    },
    {
      x: maxX - width * 0.25,
      y: safeY + height * 0.20,
      rx: baseR * 0.45, ry: baseR * 0.35,
      rotate: -12, weight: 0.45 * intensity, tone: 'grime',
    },
    // Center-bottom smudge (for higher count)
    {
      x: minX + width * 0.48,
      y: safeY + height * 0.30,
      rx: baseR * 1.0, ry: baseR * 0.65,
      rotate: 8, weight: 0.30 * intensity, tone: 'smudge',
    },
    // Extra grime accent
    {
      x: minX + width * 0.35,
      y: safeY + height * 0.32,
      rx: baseR * 0.35, ry: baseR * 0.3,
      rotate: 55, weight: 0.42 * intensity, tone: 'grime',
    },
  ];

  return all.slice(0, count + Math.min(count, 3)); // smudges + grime spots
}

/** Adult fallback smudges (no body path detected) */
const ADULT_FALLBACK_SMUDGES: SmudgeDef[] = [
  { x: 78, y: 135, rx: 6, ry: 3.5, rotate: 20, weight: 0.40, tone: 'smudge' },
  { x: 122, y: 130, rx: 5.5, ry: 3, rotate: -15, weight: 0.35, tone: 'smudge' },
  { x: 82, y: 142, rx: 2.5, ry: 2, rotate: 35, weight: 0.50, tone: 'grime' },
  { x: 118, y: 138, rx: 2, ry: 1.5, rotate: -8, weight: 0.45, tone: 'grime' },
  { x: 100, y: 150, rx: 5, ry: 3, rotate: 5, weight: 0.30, tone: 'smudge' },
  { x: 90, y: 152, rx: 1.5, ry: 1.2, rotate: 50, weight: 0.40, tone: 'grime' },
];

/**
 * Generate an organic blob path for a smudge.
 * Creates a closed bezier shape that reads as a soft mud splat.
 * The shape is an irregular ellipse with slight bulges for organic feel.
 */
function smudgePath(s: SmudgeDef): string {
  const { x, y, rx, ry, rotate } = s;
  // Four-point organic blob using cubic beziers
  // Slight asymmetry makes it look natural and hand-drawn
  const k = 0.55; // Bezier circle approximation constant
  const jx = rx * 0.15; // Asymmetry jitter (horizontal)
  const jy = ry * 0.12; // Asymmetry jitter (vertical)

  return `<path
    d="M ${x - rx} ${y}
       C ${x - rx} ${y - ry * k - jy}, ${x - rx * k + jx} ${y - ry}, ${x + jx} ${y - ry}
       C ${x + rx * k + jx} ${y - ry}, ${x + rx} ${y - ry * k + jy}, ${x + rx} ${y + jy}
       C ${x + rx} ${y + ry * k + jy}, ${x + rx * k - jx} ${y + ry}, ${x - jx} ${y + ry}
       C ${x - rx * k - jx} ${y + ry}, ${x - rx} ${y + ry * k - jy}, ${x - rx} ${y}
       Z"
    fill="${s.tone === 'grime' ? MUD_COLORS.grime : MUD_COLORS.smudge}"
    opacity="${s.weight.toFixed(2)}"
    transform="rotate(${rotate} ${x} ${y})"
  />`;
}

/**
 * Generate dirt/grime visuals on the body.
 *
 * Produces:
 *   1. Muddy smudges — soft organic blobs in warm brown
 *   2. Grime spots — small darker accents clustered near smudges
 *   3. Dusty patches — large ultra-low-opacity circles for subtle body tinting
 *
 * Placement rules:
 *   - AVOID face region (eyes, mouth, eyebrows, tears, drool, blush, sparkles)
 *   - PREFER lower-left and lower-right edges of body silhouette
 *   - Adult uses detected body bounds; baby uses fixed positions
 */
export function generateDirtMarks(config: DirtMarksConfig): string {
  if (!config.enabled) return '';

  const count = config.count ?? 3;
  const variant = config.variant ?? 'adult';
  const intensity = config.intensity ?? 0.6;
  const parts: string[] = [];

  // Resolve smudge definitions
  let smudges: SmudgeDef[];

  if (variant === 'adult' && config.bodyPath) {
    smudges = computeAdultSmudges(config.bodyPath, count, intensity);
  } else if (variant === 'baby') {
    // Scale intensity into baby smudges
    smudges = BABY_SMUDGES.slice(0, count + Math.min(count, 3)).map((s) => ({
      ...s,
      weight: s.weight * intensity,
    }));
  } else {
    smudges = ADULT_FALLBACK_SMUDGES.slice(0, count + Math.min(count, 3)).map((s) => ({
      ...s,
      weight: s.weight * intensity,
    }));
  }

  // Render smudge blobs
  smudges.forEach((s, i) => {
    parts.push(`<g class="blobbi-mud-smudge blobbi-mud-smudge-${i}">${smudgePath(s)}</g>`);
  });

  // Dusty patches — very large, ultra-low-opacity circles for overall "grimy tint"
  // Only 1-2 of these, placed behind the smudges in the lower body
  if (smudges.length >= 2) {
    const s0 = smudges[0];
    const s1 = smudges[1];
    const dustR = variant === 'baby' ? 8 : 16;
    const dustOpacity = (0.08 * intensity).toFixed(2);

    parts.push(`<circle
      class="blobbi-dust-patch"
      cx="${((s0.x + s1.x) / 2).toFixed(1)}"
      cy="${((s0.y + s1.y) / 2 + dustR * 0.3).toFixed(1)}"
      r="${dustR}"
      fill="${MUD_COLORS.dust}"
      opacity="${dustOpacity}"
    />`);
  }

  return parts.join('\n');
}

// ─── Grime Haze Particles (replaces old dust particles) ──────────────────────

/**
 * Generate subtle floating grime particles near dirty areas.
 * These are small brownish dots that pulse gently to suggest
 * dust motes or grime particles lifting off the body.
 *
 * Lighter touch than the old version — fewer particles, softer animation,
 * placed coherently near the smudge regions rather than scattered randomly.
 */
export function generateDustParticles(config: DirtMarksConfig): string {
  if (!config.enabled) return '';

  const variant = config.variant ?? 'adult';
  const intensity = config.intensity ?? 0.6;
  const particles: string[] = [];

  // Compute particle positions near the lower body edges
  interface Mote {
    x: number; y: number; r: number; delay: number;
  }

  let motes: Mote[];

  if (variant === 'adult' && config.bodyPath) {
    const { minX, maxX, maxY, width, height } = config.bodyPath;
    const baseR = Math.max(1.2, width * 0.015);
    const bottomY = maxY - height * 0.15;

    motes = [
      { x: minX + width * 0.15, y: bottomY, r: baseR, delay: 0 },
      { x: maxX - width * 0.15, y: bottomY - height * 0.05, r: baseR * 0.85, delay: 0.6 },
      { x: minX + width * 0.40, y: bottomY + height * 0.08, r: baseR * 0.7, delay: 1.2 },
    ];
  } else if (variant === 'baby') {
    motes = [
      { x: 32, y: 79, r: 1.0, delay: 0 },
      { x: 66, y: 77, r: 0.9, delay: 0.6 },
      { x: 48, y: 83, r: 0.75, delay: 1.2 },
    ];
  } else {
    motes = [
      { x: 80, y: 140, r: 1.5, delay: 0 },
      { x: 120, y: 137, r: 1.3, delay: 0.6 },
      { x: 98, y: 150, r: 1.1, delay: 1.2 },
    ];
  }

  const baseOpacity = 0.35 * intensity;

  motes.forEach((m, i) => {
    particles.push(`<circle
      class="blobbi-grime-mote blobbi-grime-mote-${i}"
      cx="${m.x.toFixed(1)}"
      cy="${m.y.toFixed(1)}"
      r="${m.r.toFixed(1)}"
      fill="${MUD_COLORS.grime}"
      opacity="${baseOpacity.toFixed(2)}"
    >
      <animate
        attributeName="opacity"
        values="${baseOpacity.toFixed(2)};${(baseOpacity * 0.4).toFixed(2)};${baseOpacity.toFixed(2)}"
        dur="3s"
        begin="${m.delay}s"
        repeatCount="indefinite"
      />
      <animate
        attributeName="cy"
        values="${m.y.toFixed(1)};${(m.y - 2).toFixed(1)};${m.y.toFixed(1)}"
        dur="3.5s"
        begin="${m.delay}s"
        repeatCount="indefinite"
      />
    </circle>`);
  });

  return particles.join('\n');
}

// ─── Odor Wisps (replaces old stink clouds) ──────────────────────────────────

/**
 * Position and timing for a single wisp group (wavy line + puff).
 */
interface WispDef {
  /** X origin (base of the wisp) */
  x: number;
  /** Y origin */
  y: number;
  /** Animation start delay */
  delay: number;
  /** Horizontal drift direction (-1 left, +1 right) */
  drift: number;
}

/** Baby (100x100) wisp origins — near upper-left and upper-right of body */
const BABY_WISP_POSITIONS: WispDef[] = [
  { x: 28, y: 45, delay: 0, drift: -1 },
  { x: 72, y: 42, delay: 1.0, drift: 1 },
  { x: 50, y: 30, delay: 2.0, drift: -1 },
  { x: 38, y: 48, delay: 2.8, drift: 1 },
];

/** Adult (200x200) wisp origins */
const ADULT_WISP_POSITIONS: WispDef[] = [
  { x: 58, y: 90, delay: 0, drift: -1 },
  { x: 142, y: 85, delay: 1.0, drift: 1 },
  { x: 100, y: 60, delay: 2.0, drift: -1 },
  { x: 70, y: 95, delay: 2.8, drift: 1 },
];

/**
 * Generate a single wavy stink line SVG path.
 * Classic cartoon "smell line" — an S-curve that rises vertically.
 *
 * The line has 2 full sine-like wiggles over its height, creating
 * the universally recognized "wavy stink line" motif.
 */
function wispLinePath(
  x: number,
  y: number,
  drift: number,
  scale: number,
): string {
  // The wisp rises ~18*scale units upward with 2 S-curves
  const h = 18 * scale; // Total height
  const w = 3.5 * scale; // Wiggle amplitude
  const d = drift;

  // Start at bottom, wiggle up in an S-shape
  return `M ${x} ${y}
    C ${x + w * d} ${y - h * 0.15}, ${x - w * d} ${y - h * 0.35}, ${x + w * 0.3 * d} ${y - h * 0.5}
    C ${x + w * d} ${y - h * 0.65}, ${x - w * d} ${y - h * 0.85}, ${x} ${y - h}`;
}

/**
 * Generate animated odor wisps around the Blobbi.
 *
 * Each wisp group consists of:
 *   1. A wavy "stink line" — the primary read for "smell"
 *   2. A small soft puff cloudlet — secondary depth
 *
 * The wisps float upward and fade out, then loop.
 * Placed at the sides/top of the body so they read as emanating outward.
 */
export function generateStinkClouds(config: StinkCloudsConfig): string {
  if (!config.enabled) return '';

  const count = config.count ?? 3;
  const variant = config.variant ?? 'adult';
  const clouds: string[] = [];
  const isBaby = variant === 'baby';
  const scale = isBaby ? 1 : 2;
  const floatDist = isBaby ? 10 : 20;

  const basePositions = isBaby ? BABY_WISP_POSITIONS : ADULT_WISP_POSITIONS;
  const wisps = basePositions.slice(0, count);

  // Stink line stroke width
  const strokeW = isBaby ? 1.2 : 2;
  // Small puff radius
  const puffR = isBaby ? 2 : 4;

  wisps.forEach((w, i) => {
    const linePath = wispLinePath(w.x, w.y, w.drift, scale);

    clouds.push(`<g class="blobbi-odor-wisp blobbi-odor-wisp-${i}" opacity="0">
      <!-- Wavy stink line -->
      <path
        d="${linePath}"
        stroke="${SMELL_COLORS.wisp}"
        stroke-width="${strokeW}"
        stroke-linecap="round"
        fill="none"
        opacity="0.7"
      />
      <!-- Small puff cloudlet near mid-wisp -->
      <circle
        cx="${(w.x + w.drift * 2 * scale).toFixed(1)}"
        cy="${(w.y - 9 * scale).toFixed(1)}"
        r="${puffR}"
        fill="${SMELL_COLORS.puff}"
        opacity="0.25"
      />
      <!-- Rise + fade animation on the whole group -->
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; ${(w.drift * 2 * scale).toFixed(1)} -${floatDist}"
        dur="3.5s"
        begin="${w.delay}s"
        repeatCount="indefinite"
      />
      <animate
        attributeName="opacity"
        values="0;0.7;0.7;0"
        keyTimes="0;0.12;0.65;1"
        dur="3.5s"
        begin="${w.delay}s"
        repeatCount="indefinite"
      />
    </g>`);
  });

  // Optional: buzzing flies
  if (config.flies) {
    const flyMarkup = generateFlies(config);
    if (flyMarkup) clouds.push(flyMarkup);
  }

  return clouds.join('\n');
}

// ─── Buzzing Flies ────────────────────────────────────────────────────────────

/**
 * Fly orbit definition: center of orbit + radii.
 */
interface FlyOrbit {
  /** Center X of the elliptical orbit */
  cx: number;
  /** Center Y of the orbit */
  cy: number;
  /** Horizontal orbit radius */
  rx: number;
  /** Vertical orbit radius */
  ry: number;
  /** Orbit duration in seconds */
  dur: number;
  /** Delay before starting */
  delay: number;
}

/**
 * Fly orbits for baby variant (100x100 viewBox).
 * Positioned in the lower third of the body (y: 72-86), well below the
 * face region (eyes ~y:50, mouth ~y:60). Orbits are small and tight
 * so flies stay near the dirty lower body / feet area.
 */
const BABY_FLY_ORBITS: FlyOrbit[] = [
  { cx: 58, cy: 80, rx: 5, ry: 3, dur: 2.2, delay: 0 },
  { cx: 38, cy: 78, rx: 4.5, ry: 2.5, dur: 2.8, delay: 0.5 },
  { cx: 50, cy: 84, rx: 4, ry: 2.5, dur: 3.2, delay: 1.0 },
];

/**
 * Fly orbits for adult variant (200x200 viewBox).
 * Positioned in the lower third of the body (y: 140-165), well below
 * the face region (eyes ~y:90-100, mouth ~y:110-120). Small orbit
 * radii keep flies circling tightly around the grimy lower body.
 */
const ADULT_FLY_ORBITS: FlyOrbit[] = [
  { cx: 120, cy: 155, rx: 10, ry: 6, dur: 2.2, delay: 0 },
  { cx: 78, cy: 150, rx: 9, ry: 5, dur: 2.8, delay: 0.5 },
  { cx: 100, cy: 162, rx: 8, ry: 5, dur: 3.2, delay: 1.0 },
];

/**
 * Generate tiny buzzing flies orbiting near the Blobbi.
 * Each fly is a small dot that follows an elliptical path.
 * Classic Tamagotchi dirty indicator.
 */
function generateFlies(config: StinkCloudsConfig): string {
  const count = config.flyCount ?? 2;
  const variant = config.variant ?? 'adult';
  const isBaby = variant === 'baby';
  const orbits = (isBaby ? BABY_FLY_ORBITS : ADULT_FLY_ORBITS).slice(0, count);
  const flyR = isBaby ? 0.8 : 1.4;

  const flies: string[] = [];

  orbits.forEach((orbit, i) => {
    // Build an elliptical orbit path for <animateMotion>
    const orbitPath = `M ${orbit.cx - orbit.rx} ${orbit.cy}
      A ${orbit.rx} ${orbit.ry} 0 1 1 ${orbit.cx + orbit.rx} ${orbit.cy}
      A ${orbit.rx} ${orbit.ry} 0 1 1 ${orbit.cx - orbit.rx} ${orbit.cy} Z`;

    flies.push(`<g class="blobbi-fly blobbi-fly-${i}">
      <circle r="${flyR}" fill="${SMELL_COLORS.fly}" opacity="0.75">
        <animateMotion
          path="${orbitPath}"
          dur="${orbit.dur}s"
          begin="${orbit.delay}s"
          repeatCount="indefinite"
          rotate="auto"
        />
      </circle>
    </g>`);
  });

  return flies.join('\n');
}

// ─── Anger Rise ───────────────────────────────────────────────────────────────

/**
 * Generate the anger-rise body effect.
 * Creates a colored overlay that animates from bottom to top inside the body shape.
 * 
 * @param bodyPath - Detected body path info
 * @param config - Effect configuration (color, duration)
 * @param idSuffix - Unique suffix for clip/gradient IDs (prevents collisions when multiple Blobbis render)
 */
export function generateAngerRiseEffect(
  bodyPath: BodyPathInfo,
  config: BodyEffectConfig,
  idSuffix?: string,
): { defs: string; overlay: string } {
  const { pathD, minX, maxX, minY, maxY } = bodyPath;
  const bodyHeight = maxY - minY;
  const bodyWidth = maxX - minX;
  
  const suffix = idSuffix ?? Math.random().toString(36).slice(2, 8);
  const clipId = `blobbi-anger-clip-${suffix}`;
  const gradientId = `blobbi-anger-gradient-${suffix}`;
  
  // When `level` is provided, render a static gradient at that offset (0–1)
  // instead of using the SMIL rise animation. This lets external systems
  // (e.g. overstimulation reaction, nausea) control exact fill height each frame.
  //
  // `level` controls only how HIGH the fill reaches. Opacity is controlled
  // separately via bottomOpacity/edgeOpacity so different effects (anger vs
  // nausea) can have different visual intensities through the same generator.
  const useStaticLevel = config.level !== undefined && config.level !== null;
  const lvl = useStaticLevel ? Math.max(0, Math.min(1, config.level!)) : 0;

  // Caller-controlled opacity with moderate defaults.
  // Nausea uses stronger values (~0.78/0.65); anger uses these defaults.
  const bottomOpacity = config.bottomOpacity ?? 0.55;
  const edgeOpacity = config.edgeOpacity ?? 0.45;

  // Feather zone: fraction of the gradient used for the soft top edge.
  // Slightly larger than the animated path to keep the edge soft when the
  // fill height is re-rendered every frame.
  const feather = 0.10;

  const defs = useStaticLevel
    ? `
    <clipPath id="${clipId}">
      <path d="${pathD}" />
    </clipPath>
    <linearGradient id="${gradientId}" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="${config.color}" stop-opacity="${bottomOpacity}" />
      <stop offset="${Math.max(0, lvl - feather)}" stop-color="${config.color}" stop-opacity="${edgeOpacity}" />
      <stop offset="${lvl}" stop-color="${config.color}" stop-opacity="0" />
    </linearGradient>`
    : `
    <clipPath id="${clipId}">
      <path d="${pathD}" />
    </clipPath>
    <linearGradient id="${gradientId}" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="${config.color}">
        <animate 
          attributeName="stop-opacity" 
          values="0;0.5;0.5" 
          keyTimes="0;0.5;1"
          dur="${config.duration}s" 
          fill="freeze"
        />
      </stop>
      <stop stop-color="${config.color}">
        <animate 
          attributeName="offset" 
          values="0;1" 
          dur="${config.duration}s" 
          fill="freeze"
        />
        <animate 
          attributeName="stop-opacity" 
          values="0;0.4;0.4" 
          keyTimes="0;0.3;1"
          dur="${config.duration}s" 
          fill="freeze"
        />
      </stop>
      <stop stop-color="${config.color}" stop-opacity="0">
        <animate 
          attributeName="offset" 
          values="0;1" 
          dur="${config.duration}s" 
          fill="freeze"
        />
      </stop>
    </linearGradient>`;
  
  // Use detected body bounds with a small pad to ensure the rect fully
  // covers the body silhouette for both baby (100x100) and adult (200x200)
  // viewBoxes. The clip-path masks any overshoot.
  const pad = 2;
  const rectX = minX - pad;
  const rectW = bodyWidth + pad * 2;

  const overlay = `
    <rect 
      class="blobbi-anger-rise"
      x="${rectX}" y="${minY}" 
      width="${rectW}" height="${bodyHeight}"
      fill="url(#${gradientId})"
      clip-path="url(#${clipId})"
    />`;
  
  return { defs, overlay };
}
