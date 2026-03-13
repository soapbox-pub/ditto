/** Predefined avatar shapes stored in kind-0 metadata as the `shape` property. */
export const AVATAR_SHAPES = [
  'circle',
  'triangle',
  'inverted-triangle',
  'hexagon',
  'star',
  'inverted-star',
  'hexagram',
  'heart',
] as const;

export type AvatarShape = (typeof AVATAR_SHAPES)[number];

/** Type guard for valid avatar shape values. */
export function isValidAvatarShape(value: unknown): value is AvatarShape {
  return typeof value === 'string' && (AVATAR_SHAPES as readonly string[]).includes(value);
}

/**
 * Returns a human-readable label for each shape.
 */
export function getAvatarShapeLabel(shape: AvatarShape): string {
  switch (shape) {
    case 'circle': return 'Circle';
    case 'triangle': return 'Triangle';
    case 'inverted-triangle': return 'Inv. Triangle';
    case 'hexagon': return 'Hexagon';
    case 'star': return 'Star';
    case 'inverted-star': return 'Inv. Star';
    case 'hexagram': return 'Hexagram';
    case 'heart': return 'Heart';
  }
}

// ── Clip-path polygon definitions ──────────────────────────────────────────

/** Generates polygon points for a regular polygon inscribed in a unit circle. */
function regularPolygon(sides: number, rotationDeg: number = -90): string {
  const points: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (rotationDeg + (360 / sides) * i) * (Math.PI / 180);
    const x = 50 + 50 * Math.cos(angle);
    const y = 50 + 50 * Math.sin(angle);
    points.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  return `polygon(${points.join(', ')})`;
}

/** Generates a star polygon (alternating outer/inner vertices). */
function starPolygon(points: number, innerRatio: number, rotationDeg: number = -90): string {
  const coords: string[] = [];
  const totalVertices = points * 2;
  for (let i = 0; i < totalVertices; i++) {
    const angle = (rotationDeg + (360 / totalVertices) * i) * (Math.PI / 180);
    const r = i % 2 === 0 ? 50 : 50 * innerRatio;
    const x = 50 + r * Math.cos(angle);
    const y = 50 + r * Math.sin(angle);
    coords.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  return `polygon(${coords.join(', ')})`;
}

/**
 * Generates a heart shape as a polygon by sampling a parametric heart curve.
 * Uses the parametric equations: x = sin(t)^3, y = cos(t) - cos(2t)/3 - cos(3t)/6
 * Shifted and scaled to fit a 0-100% coordinate space.
 */
function heartPolygon(): string {
  const points: string[] = [];
  const steps = 50;
  // Sample the parametric heart curve
  const rawPoints: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const x = Math.pow(Math.sin(t), 3);
    const y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
    rawPoints.push([x, y]);
  }
  // Find bounds for normalization
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of rawPoints) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const rangeX = maxX - minX;
  const rangeY = maxY - minY;
  // Normalize to 0-100% with a small margin (2%) and flip Y (heart curve has Y pointing up)
  const margin = 2;
  const usable = 100 - 2 * margin;
  for (const [x, y] of rawPoints) {
    const px = margin + ((x - minX) / rangeX) * usable;
    const py = margin + ((1 - (y - minY) / rangeY)) * usable;
    points.push(`${px.toFixed(2)}% ${py.toFixed(2)}%`);
  }
  return `polygon(${points.join(', ')})`;
}

/**
 * Extracts a valid AvatarShape from a NostrMetadata object (or any object with a `shape` property).
 * Returns `undefined` if the shape is missing or invalid (which means "circle" / default).
 */
export function getAvatarShape(metadata: Record<string, unknown> | undefined): AvatarShape | undefined {
  const raw = metadata?.shape;
  return isValidAvatarShape(raw) ? raw : undefined;
}

/**
 * Returns the CSS `clip-path` value for the given shape.
 * Returns `undefined` for `circle` (uses `rounded-full` instead).
 */
export function getAvatarClipPath(shape: AvatarShape | undefined): string | undefined {
  switch (shape) {
    case undefined:
    case 'circle':
      return undefined;

    case 'triangle':
      return regularPolygon(3, -90);

    case 'inverted-triangle':
      return regularPolygon(3, 90);

    case 'hexagon':
      return regularPolygon(6, -90);

    case 'star':
      return starPolygon(5, 0.38, -90);

    case 'inverted-star':
      return starPolygon(5, 0.38, 90);

    case 'hexagram':
      return starPolygon(6, 0.577, -90);

    case 'heart':
      return heartPolygon();
  }
}
