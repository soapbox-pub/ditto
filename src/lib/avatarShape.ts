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

export type PredefinedAvatarShape = (typeof AVATAR_SHAPES)[number];

/**
 * An avatar shape is either a predefined geometric shape name or an emoji string.
 * Emojis are rendered as mask images over the avatar.
 */
export type AvatarShape = PredefinedAvatarShape | (string & {});

/** Type guard for valid predefined avatar shape values. */
export function isPredefinedAvatarShape(value: unknown): value is PredefinedAvatarShape {
  return typeof value === 'string' && (AVATAR_SHAPES as readonly string[]).includes(value);
}

// ── Emoji detection ──────────────────────────────────────────────────────────

/**
 * Checks whether a string could be an emoji shape value.
 *
 * Rather than trying to match specific Unicode emoji patterns (which is
 * fragile and excludes valid emoji like keycap sequences, flags, and
 * complex ZWJ families), we simply check that the value is a short
 * non-ASCII string that isn't a predefined shape name.
 */
export function isEmoji(value: string): boolean {
  if (!value || value.length === 0) return false;
  // Predefined shape names are handled separately
  if (isPredefinedAvatarShape(value)) return false;
  // Emoji are short (even complex ZWJ sequences are under ~20 JS chars)
  // and contain non-ASCII characters. Reject long strings and pure ASCII
  // to avoid treating arbitrary text as emoji.
  if (value.length > 20) return false;
  // Must contain at least one non-ASCII character
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(value);
}

/** Type guard for valid avatar shape values (predefined name OR emoji). */
export function isValidAvatarShape(value: unknown): value is AvatarShape {
  if (typeof value !== 'string' || value.length === 0) return false;
  return isPredefinedAvatarShape(value) || isEmoji(value);
}

/**
 * Returns a human-readable label for each predefined shape.
 */
export function getAvatarShapeLabel(shape: PredefinedAvatarShape): string {
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
 * Returns `undefined` for `circle`, absent shapes, and emoji shapes
 * (emojis use mask-image instead).
 */
export function getAvatarClipPath(shape: AvatarShape | undefined): string | undefined {
  if (!shape || shape === 'circle') return undefined;
  // Emoji shapes are handled via mask-image, not clip-path
  if (!isPredefinedAvatarShape(shape)) return undefined;

  switch (shape) {
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

// ── Emoji mask generation ──────────────────────────────────────────────────

/** In-memory cache: emoji string → data-URL. */
const emojiMaskCache = new Map<string, string>();

/**
 * Renders the user's native OS emoji onto a canvas and produces a PNG
 * data-URL alpha mask suitable for use as a CSS `mask-image`.
 *
 * ### Algorithm
 *
 * 1. **Draw large.** Render the emoji at 512 px via `fillText` on an
 *    oversized (768 × 768) scratch canvas so the entire glyph is captured
 *    even if the OS renders it off-centre or larger than the em-box.
 *
 * 2. **Measure.** Scan every pixel to find the tight axis-aligned bounding
 *    box of non-transparent pixels.
 *
 * 3. **Square the crop.** Expand the shorter axis of the bounding box so the
 *    crop region is square (centred). This prevents non-square emoji from
 *    being stretched when applied to a square avatar.
 *
 * 4. **Redraw.** Draw the squared crop onto a 256 × 256 output canvas so the
 *    emoji fills it edge-to-edge.
 *
 * 5. **Convert to alpha mask.** Set every pixel to white; keep the original
 *    alpha channel. Export as PNG data-URL.
 *
 * If `mask-image` is unsupported the avatar renders as a plain square
 * (the emoji mask is simply ignored by the browser).
 */
export function getEmojiMaskUrl(emoji: string): string {
  const cached = emojiMaskCache.get(emoji);
  if (cached) return cached;

  // ── Pass 1: draw emoji on oversized scratch canvas ──────────────────
  const fontSize = 512;
  const scratch = fontSize * 1.5;               // 768 – generous room
  const c1 = document.createElement('canvas');
  c1.width = scratch;
  c1.height = scratch;
  const ctx1 = c1.getContext('2d');
  if (!ctx1) return '';

  ctx1.textAlign = 'center';
  ctx1.textBaseline = 'middle';
  ctx1.font = `${fontSize}px serif`;
  ctx1.fillText(emoji, scratch / 2, scratch / 2);

  // ── Pass 2: find tight bounding box ─────────────────────────────────
  // Use an alpha threshold to ignore semi-transparent shadows, glows, and
  // anti-aliasing fringes that many emoji renderers add. Without this,
  // faint pixels (e.g. a drop shadow) inflate the bounding box and push
  // the actual emoji shape off-centre when the crop is squared.
  const ALPHA_THRESHOLD = 25;                    // ~10% opacity
  const { data: px, width: sw, height: sh } = ctx1.getImageData(0, 0, scratch, scratch);
  let t = sh, b = 0, l = sw, r = 0;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (px[(y * sw + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (y < t) t = y;
        if (y > b) b = y;
        if (x < l) l = x;
        if (x > r) r = x;
      }
    }
  }
  if (r < l || b < t) return '';                 // nothing drawn

  // ── Pass 3: square the bounding box ─────────────────────────────────
  let cropW = r - l + 1;
  let cropH = b - t + 1;
  if (cropW > cropH) {
    const diff = cropW - cropH;
    t -= Math.floor(diff / 2);
    b = t + cropW - 1;
    cropH = cropW;
  } else if (cropH > cropW) {
    const diff = cropH - cropW;
    l -= Math.floor(diff / 2);
    r = l + cropH - 1;
    cropW = cropH;
  }
  // Clamp to canvas bounds (shouldn't be needed with oversized scratch,
  // but be safe).
  if (t < 0) t = 0;
  if (l < 0) l = 0;

  // ── Pass 4: redraw cropped region onto output canvas ────────────────
  const out = 256;
  const c2 = document.createElement('canvas');
  c2.width = out;
  c2.height = out;
  const ctx2 = c2.getContext('2d');
  if (!ctx2) return '';

  ctx2.drawImage(c1, l, t, cropW, cropH, 0, 0, out, out);

  // ── Pass 5: convert to alpha mask (white + original alpha) ──────────
  const img = ctx2.getImageData(0, 0, out, out);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255;       // R
    d[i + 1] = 255;   // G
    d[i + 2] = 255;   // B
    // d[i+3] (alpha) kept as-is
  }
  ctx2.putImageData(img, 0, 0);

  const url = c2.toDataURL('image/png');
  emojiMaskCache.set(emoji, url);
  return url;
}
