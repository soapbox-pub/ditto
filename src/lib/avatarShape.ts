/** Predefined avatar shapes stored in kind-0 metadata as the `shape` property. */
export const AVATAR_SHAPES = [
  'circle',
  'triangle',
  'inverted-triangle',
  'hexagon',
  'star',
  'inverted-star',
  'hexagram',
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
  }
}
