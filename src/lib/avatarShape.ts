/**
 * An avatar shape is an emoji string stored in kind-0 metadata as the `shape` property.
 * When absent or invalid, avatars render as circles (the default).
 */
export type AvatarShape = string;

// ── Emoji detection ──────────────────────────────────────────────────────────

/**
 * Checks whether a string could be an emoji shape value.
 *
 * Rather than trying to match specific Unicode emoji patterns (which is
 * fragile and excludes valid emoji like keycap sequences, flags, and
 * complex ZWJ families), we simply check that the value is a short
 * non-ASCII string.
 */
export function isEmoji(value: string): boolean {
  if (!value || value.length === 0) return false;
  // Emoji are short (even complex ZWJ sequences are under ~20 JS chars)
  // and contain non-ASCII characters. Reject long strings and pure ASCII
  // to avoid treating arbitrary text as emoji.
  if (value.length > 20) return false;
  // Must contain at least one non-ASCII character
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(value);
}

/** Type guard for valid avatar shape values (emoji strings only). */
export function isValidAvatarShape(value: unknown): value is AvatarShape {
  if (typeof value !== 'string' || value.length === 0) return false;
  return isEmoji(value);
}

/**
 * Extracts a valid AvatarShape from a metadata object (or any object with a `shape` property).
 * Accepts `NostrMetadata` directly — no type cast needed at call sites.
 * Returns `undefined` if the shape is missing or invalid (which means "circle" / default).
 */
export function getAvatarShape(metadata: { [key: string]: unknown } | undefined): AvatarShape | undefined {
  const raw = metadata?.shape;
  return isValidAvatarShape(raw) ? raw : undefined;
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
