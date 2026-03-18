/**
 * Blobbi Avatar Shapes
 *
 * Defines body silhouettes for Blobbi characters that can be used as avatar masks.
 * Each shape stores the original SVG body markup directly (supporting circles,
 * ellipses, rects, paths, transforms, and stroke-based shapes), preserving the
 * exact visual appearance of the original SVG files.
 *
 * Shape IDs use the format: blobbi:shapeName (e.g., "blobbi:baby", "blobbi:catti")
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BlobbiShape {
  /** Unique identifier (e.g., "baby", "catti") */
  id: string;
  /** Display name for UI */
  name: string;
  /** Category for grouping in UI */
  category: 'egg' | 'baby' | 'adult';
  /** SVG viewBox (e.g., "0 0 100 100") */
  viewBox: string;
  /**
   * Raw SVG body markup for the silhouette.
   * This should contain only the body shape elements (no eyes, mouth, etc.).
   * Supports: circle, ellipse, rect, path, g, transforms, strokes.
   * When rendered as a mask, all elements are filled/stroked with white.
   */
  svg: string;
  /** Optional preview color for thumbnails */
  previewColor?: string;
}

// ─── Shape Definitions ────────────────────────────────────────────────────────

/**
 * All available Blobbi shapes.
 * Body SVG markup is extracted from the actual SVG files, keeping only the main silhouette
 * elements (body, ears, tail, arms, legs) and excluding face details (eyes, mouth, blush).
 */
export const BLOBBI_SHAPES: BlobbiShape[] = [
  // ── Egg ──────────────────────────────────────────────────────────────────
  {
    id: 'egg',
    name: 'Egg',
    category: 'egg',
    viewBox: '0 0 100 100',
    svg: `<ellipse cx="50" cy="52" rx="32" ry="42" />`,
    previewColor: '#f5f5f4',
  },

  // ── Baby ─────────────────────────────────────────────────────────────────
  {
    id: 'baby',
    name: 'Baby Blobbi',
    category: 'baby',
    viewBox: '0 0 100 100',
    svg: `<path d="M 50 15 Q 50 10 50 15 Q 72 25 75 55 Q 75 80 50 88 Q 25 80 25 55 Q 28 25 50 15" />`,
    previewColor: '#8b5cf6',
  },

  // ── Adults ───────────────────────────────────────────────────────────────

  {
    id: 'bloomi',
    name: 'Bloomi',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Flower with 6 petals and center
    svg: `
      <circle cx="100" cy="70" r="25" />
      <circle cx="130" cy="90" r="25" />
      <circle cx="130" cy="130" r="25" />
      <circle cx="100" cy="150" r="25" />
      <circle cx="70" cy="130" r="25" />
      <circle cx="70" cy="90" r="25" />
      <circle cx="100" cy="110" r="35" />
    `,
    previewColor: '#f472b6',
  },

  {
    id: 'breezy',
    name: 'Breezy',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Leaf body with arms and legs
    svg: `
      <path d="M 100 40 Q 70 60 60 90 Q 55 120 70 140 Q 85 155 100 160 Q 115 155 130 140 Q 145 120 140 90 Q 130 60 100 40" />
      <path d="M 65 100 Q 55 95 50 105 Q 55 115 65 110" />
      <path d="M 135 100 Q 145 95 150 105 Q 145 115 135 110" />
      <ellipse cx="90" cy="155" rx="10" ry="8" />
      <ellipse cx="110" cy="155" rx="10" ry="8" />
    `,
    previewColor: '#4ade80',
  },

  {
    id: 'cacti',
    name: 'Cacti',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Cactus body with arms, flower, and pot
    svg: `
      <rect x="85" y="80" width="30" height="80" rx="15" />
      <rect x="60" y="100" width="20" height="40" rx="10" />
      <rect x="120" y="110" width="20" height="35" rx="10" />
      <circle cx="100" cy="75" r="12" />
      <path d="M 75 160 L 80 175 L 120 175 L 125 160 Z" />
      <rect x="75" y="160" width="50" height="5" rx="2" />
    `,
    previewColor: '#22c55e',
  },

  {
    id: 'catti',
    name: 'Catti',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Cat body with ears and curved tail (stroke-based)
    svg: `
      <ellipse cx="100" cy="120" rx="45" ry="60" />
      <path d="M 68 72 L 58 48 L 82 62 Z" />
      <path d="M 132 72 L 142 48 L 118 62 Z" />
      <path d="M 145 140 Q 165 115 158 95 Q 148 75 165 65" stroke-width="22" fill="none" stroke-linecap="round" />
    `,
    previewColor: '#f97316',
  },

  {
    id: 'cloudi',
    name: 'Cloudi',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Cloud body - multiple overlapping circles
    svg: `
      <circle cx="100" cy="120" r="45" />
      <circle cx="75" cy="110" r="35" />
      <circle cx="125" cy="110" r="35" />
      <circle cx="85" cy="95" r="25" />
      <circle cx="115" cy="95" r="25" />
      <circle cx="100" cy="85" r="30" />
    `,
    previewColor: '#e2e8f0',
  },

  {
    id: 'crysti',
    name: 'Crysti',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Crystal hexagon body
    svg: `<path d="M 100 50 L 140 80 L 140 130 L 100 160 L 60 130 L 60 80 Z" />`,
    previewColor: '#a855f7',
  },

  {
    id: 'droppi',
    name: 'Droppi',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Water drop body with arms and legs
    svg: `
      <path d="M 100 40 Q 100 30 100 40 Q 135 60 140 110 Q 140 150 100 165 Q 60 150 60 110 Q 65 60 100 40" />
      <ellipse cx="60" cy="110" rx="10" ry="18" transform="rotate(-25 60 110)" />
      <ellipse cx="140" cy="110" rx="10" ry="18" transform="rotate(25 140 110)" />
      <ellipse cx="85" cy="160" rx="12" ry="10" />
      <ellipse cx="115" cy="160" rx="12" ry="10" />
    `,
    previewColor: '#06b6d4',
  },

  {
    id: 'flammi',
    name: 'Flammi',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Flame body with arms and legs
    svg: `
      <path d="M 100 160 Q 60 140 50 110 Q 45 80 70 60 Q 80 40 100 25 Q 120 40 130 60 Q 155 80 150 110 Q 140 140 100 160 Z" />
      <ellipse cx="55" cy="110" rx="8" ry="15" transform="rotate(-30 55 110)" />
      <ellipse cx="145" cy="110" rx="8" ry="15" transform="rotate(30 145 110)" />
      <ellipse cx="90" cy="155" rx="10" ry="8" />
      <ellipse cx="110" cy="155" rx="10" ry="8" />
    `,
    previewColor: '#f97316',
  },

  {
    id: 'froggi',
    name: 'Froggi',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Frog body with bulging eyes and webbed feet
    svg: `
      <ellipse cx="100" cy="120" rx="70" ry="50" />
      <circle cx="70" cy="80" r="27" />
      <circle cx="130" cy="80" r="27" />
      <ellipse cx="60" cy="160" rx="22" ry="12" />
      <ellipse cx="140" cy="160" rx="22" ry="12" />
    `,
    previewColor: '#22c55e',
  },

  {
    id: 'leafy',
    name: 'Leafy',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Sunflower with petals, stem, leaves, and pot
    svg: `
      <ellipse cx="100" cy="85" rx="45" ry="12" transform="rotate(0 100 85)" />
      <ellipse cx="100" cy="85" rx="45" ry="12" transform="rotate(22.5 100 85)" />
      <ellipse cx="100" cy="85" rx="45" ry="12" transform="rotate(45 100 85)" />
      <ellipse cx="100" cy="85" rx="45" ry="12" transform="rotate(67.5 100 85)" />
      <ellipse cx="100" cy="85" rx="45" ry="12" transform="rotate(90 100 85)" />
      <ellipse cx="100" cy="85" rx="45" ry="12" transform="rotate(112.5 100 85)" />
      <ellipse cx="100" cy="85" rx="45" ry="12" transform="rotate(135 100 85)" />
      <ellipse cx="100" cy="85" rx="45" ry="12" transform="rotate(157.5 100 85)" />
      <circle cx="100" cy="85" r="30" />
      <rect x="96" y="120" width="8" height="55" rx="4" />
      <ellipse cx="85" cy="140" rx="15" ry="8" transform="rotate(-30 85 140)" />
      <ellipse cx="115" cy="150" rx="15" ry="8" transform="rotate(30 115 150)" />
      <path d="M 75 160 L 80 175 L 120 175 L 125 160 Z" />
      <rect x="75" y="160" width="50" height="5" rx="2" />
    `,
    previewColor: '#fde047',
  },

  {
    id: 'mushie',
    name: 'Mushie',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Mushroom with cap, stem, and arms
    svg: `
      <ellipse cx="100" cy="140" rx="25" ry="40" />
      <path d="M 50 110 Q 50 70 100 60 Q 150 70 150 110 Z" />
      <ellipse cx="70" cy="140" rx="8" ry="12" transform="rotate(-20 70 140)" />
      <ellipse cx="130" cy="140" rx="8" ry="12" transform="rotate(20 130 140)" />
    `,
    previewColor: '#ef4444',
  },

  {
    id: 'owli',
    name: 'Owli',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Owl body with ears and wings
    svg: `
      <circle cx="100" cy="110" r="60" />
      <path d="M 60 70 L 70 48 L 82 70 Z" />
      <path d="M 118 70 L 130 48 L 140 70 Z" />
      <ellipse cx="48" cy="110" rx="16" ry="32" transform="rotate(-20 48 110)" />
      <ellipse cx="152" cy="110" rx="16" ry="32" transform="rotate(20 152 110)" />
    `,
    previewColor: '#78716c',
  },

  {
    id: 'pandi',
    name: 'Pandi',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Panda with round body, head, ears, arms, and legs
    svg: `
      <circle cx="100" cy="120" r="55" />
      <circle cx="100" cy="85" r="45" />
      <circle cx="70" cy="45" r="18" />
      <circle cx="130" cy="45" r="18" />
      <circle cx="45" cy="120" r="15" />
      <circle cx="155" cy="120" r="15" />
      <circle cx="80" cy="165" r="18" />
      <circle cx="120" cy="165" r="18" />
    `,
    previewColor: '#fafafa',
  },

  {
    id: 'rocky',
    name: 'Rocky',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Rock body with arms and legs
    svg: `
      <path d="M 100 50 L 130 70 L 140 110 L 130 150 L 100 165 L 70 150 L 60 110 L 70 70 Z" />
      <ellipse cx="55" cy="110" rx="12" ry="8" transform="rotate(-15 55 110)" />
      <ellipse cx="145" cy="110" rx="12" ry="8" transform="rotate(15 145 110)" />
      <ellipse cx="85" cy="160" rx="15" ry="10" />
      <ellipse cx="115" cy="160" rx="15" ry="10" />
    `,
    previewColor: '#a8a29e',
  },

  {
    id: 'rosey',
    name: 'Rosey',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Rose with petals, stem, and leaves
    svg: `
      <circle cx="100" cy="90" r="35" />
      <path d="M 100 60 Q 120 70 125 90 Q 120 110 100 120 Q 80 110 75 90 Q 80 70 100 60" />
      <rect x="98" y="120" width="4" height="50" rx="2" />
      <ellipse cx="85" cy="145" rx="12" ry="8" transform="rotate(-30 85 140)" />
      <ellipse cx="110" cy="150" rx="12" ry="8" transform="rotate(30 115 150)" />
    `,
    previewColor: '#fb7185',
  },

  {
    id: 'starri',
    name: 'Starri',
    category: 'adult',
    viewBox: '0 0 200 200',
    // 5-pointed star
    svg: `<path d="M 100 25 L 115 75 L 165 75 L 125 110 L 140 160 L 100 130 L 60 160 L 75 110 L 35 75 L 85 75 Z" />`,
    previewColor: '#fbbf24',
  },
];

// ─── Lookup Helpers ───────────────────────────────────────────────────────────

/** Map for O(1) shape lookup by ID */
const shapeMap = new Map(BLOBBI_SHAPES.map((s) => [s.id, s]));

/**
 * Get a Blobbi shape by ID
 */
export function getBlobbiShape(id: string): BlobbiShape | undefined {
  return shapeMap.get(id);
}

/**
 * Get shapes by category
 */
export function getBlobbiShapesByCategory(category: BlobbiShape['category']): BlobbiShape[] {
  return BLOBBI_SHAPES.filter((s) => s.category === category);
}

// ─── Shape Detection ──────────────────────────────────────────────────────────

/** Prefix used for Blobbi shape values in metadata */
export const BLOBBI_SHAPE_PREFIX = 'blobbi:';

/**
 * Check if a shape value is a Blobbi shape
 */
export function isBlobbiShape(value: string): boolean {
  return value.startsWith(BLOBBI_SHAPE_PREFIX);
}

/**
 * Extract Blobbi shape ID from a shape value
 * Returns undefined if not a Blobbi shape
 */
export function parseBlobbiShapeId(value: string): string | undefined {
  if (!isBlobbiShape(value)) return undefined;
  return value.slice(BLOBBI_SHAPE_PREFIX.length);
}

/**
 * Create a Blobbi shape value from an ID
 */
export function toBlobbiShapeValue(id: string): string {
  return `${BLOBBI_SHAPE_PREFIX}${id}`;
}

// ─── Mask Generation ──────────────────────────────────────────────────────────

/** Cache for generated PNG mask URLs */
const blobbiMaskCache = new Map<string, string>();

/** Cache for pending mask generation promises (to avoid duplicate work) */
const pendingMaskGenerations = new Map<string, Promise<string>>();

/**
 * Generate a PNG mask URL for a Blobbi shape.
 * Renders the SVG to a canvas and exports as PNG data URL.
 *
 * This is more reliable than using SVG data URLs directly in CSS mask-image,
 * which doesn't work correctly for complex SVGs with transforms in some browsers.
 *
 * @param shapeId - The Blobbi shape ID (e.g., "catti", "baby")
 * @returns PNG data URL, empty string if not yet ready, or empty if shape not found
 */
export function getBlobbiMaskUrl(shapeId: string): string {
  // Return cached PNG if available
  const cached = blobbiMaskCache.get(shapeId);
  if (cached) return cached;

  const shape = getBlobbiShape(shapeId);
  if (!shape) return '';

  // Start async generation if not already in progress
  if (!pendingMaskGenerations.has(shapeId)) {
    const promise = generatePngMask(shape).then((url) => {
      blobbiMaskCache.set(shapeId, url);
      pendingMaskGenerations.delete(shapeId);
      return url;
    });
    pendingMaskGenerations.set(shapeId, promise);
  }

  // Return empty string for now - the async version should be used for reliable results
  return '';
}

/**
 * Async version of mask URL generation.
 * This is the preferred method as it guarantees the mask is ready.
 *
 * @param shapeId - The Blobbi shape ID
 * @returns Promise resolving to PNG data URL
 */
export async function getBlobbiMaskUrlAsync(shapeId: string): Promise<string> {
  // Return cached PNG if available
  const cached = blobbiMaskCache.get(shapeId);
  if (cached) return cached;

  const shape = getBlobbiShape(shapeId);
  if (!shape) return '';

  // Return pending promise if generation is in progress
  const pending = pendingMaskGenerations.get(shapeId);
  if (pending) return pending;

  // Start new generation
  const promise = generatePngMask(shape).then((url) => {
    blobbiMaskCache.set(shapeId, url);
    pendingMaskGenerations.delete(shapeId);
    return url;
  });
  pendingMaskGenerations.set(shapeId, promise);

  return promise;
}

/**
 * Generate a PNG mask by rendering SVG to canvas.
 */
async function generatePngMask(shape: BlobbiShape): Promise<string> {
  const svgString = buildMaskSvgString(shape);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(svgUrl);

    // Parse viewBox for dimensions
    const vb = shape.viewBox.split(' ').map(Number);
    const [, , vbWidth, vbHeight] = vb;

    // Canvas size - use higher resolution for quality
    const size = 256;
    const scale = size / Math.max(vbWidth, vbHeight);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Center the shape
    const offsetX = (size - vbWidth * scale) / 2;
    const offsetY = (size - vbHeight * scale) / 2;

    ctx.drawImage(img, offsetX, offsetY, vbWidth * scale, vbHeight * scale);

    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/**
 * Load an image from a URL as a promise.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

/**
 * Build a complete SVG string for mask rendering.
 * Applies white fill and stroke to all elements.
 */
function buildMaskSvgString(shape: BlobbiShape): string {
  // Parse viewBox to get dimensions
  const vb = shape.viewBox.split(' ').map(Number);
  const [, , vbWidth, vbHeight] = vb;

  // Inject fill="white" and stroke="white" into each SVG element
  const whiteSvg = injectWhiteFillStroke(shape.svg);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${shape.viewBox}" width="${vbWidth}" height="${vbHeight}">${whiteSvg}</svg>`;
}

/**
 * Inject fill="white" and stroke="white" attributes into SVG elements.
 * Handles: circle, ellipse, rect, path, polygon, polyline, line
 * Preserves existing fill="none" for stroke-only elements.
 */
function injectWhiteFillStroke(svg: string): string {
  // Match SVG shape elements - capture tag name, attributes, and closing
  const shapeElements = /<(circle|ellipse|rect|path|polygon|polyline|line)\b([^>]*?)(\/?>)/gi;

  return svg.replace(shapeElements, (match, tagName: string, attributes: string, closing: string) => {
    let attrs = attributes || '';

    // Check if fill="none" exists (stroke-only element like catti's tail)
    const hasFillNone = /fill\s*=\s*["']none["']/i.test(attrs);

    // Remove any existing fill/stroke attributes (except fill="none")
    attrs = attrs.replace(/\s*fill\s*=\s*["'][^"']*["']/gi, (m) => {
      return /fill\s*=\s*["']none["']/i.test(m) ? m : '';
    });
    attrs = attrs.replace(/\s*stroke\s*=\s*["'][^"']*["']/gi, '');

    // Add white fill (unless it's fill="none") and white stroke
    if (!hasFillNone) {
      attrs += ' fill="white"';
    }
    attrs += ' stroke="white"';

    return `<${tagName}${attrs} ${closing}`;
  });
}

/**
 * Get the raw SVG markup for a shape, suitable for inline rendering.
 * This returns the complete SVG element as a string.
 *
 * @param shapeId - The Blobbi shape ID
 * @param fill - Optional fill color (defaults to shape's previewColor or '#a1a1aa')
 * @returns Complete SVG string or empty string if shape not found
 */
export function getBlobbiShapeSvg(shapeId: string, fill?: string): string {
  const shape = getBlobbiShape(shapeId);
  if (!shape) return '';

  const fillColor = fill || shape.previewColor || '#a1a1aa';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${shape.viewBox}">
    <style>
      * { fill: ${fillColor}; stroke: ${fillColor}; }
    </style>
    <g>${shape.svg}</g>
  </svg>`;
}
