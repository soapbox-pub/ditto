/**
 * Blobbi Avatar Shapes
 *
 * Defines body silhouettes for Blobbi characters that can be used as avatar masks.
 * Each shape is defined as an SVG path that represents the outer body shape only,
 * without eyes, mouth, or other internal details.
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
  /** SVG path data for the body silhouette */
  path: string;
  /** Optional preview color for thumbnails */
  previewColor?: string;
}

// ─── Shape Definitions ────────────────────────────────────────────────────────

/**
 * All available Blobbi shapes.
 * Body paths are extracted from the actual SVG files, keeping only the main silhouette.
 */
export const BLOBBI_SHAPES: BlobbiShape[] = [
  // ── Egg ──────────────────────────────────────────────────────────────────
  {
    id: 'egg',
    name: 'Egg',
    category: 'egg',
    viewBox: '0 0 100 100',
    // Classic egg shape - wider at bottom, narrower at top
    path: 'M 50 10 Q 75 25 78 55 Q 78 85 50 92 Q 22 85 22 55 Q 25 25 50 10 Z',
    previewColor: '#f5f5f4',
  },

  // ── Baby ─────────────────────────────────────────────────────────────────
  {
    id: 'baby',
    name: 'Baby Blobbi',
    category: 'baby',
    viewBox: '0 0 100 100',
    // Water droplet shape from blobbi-baby-base.svg
    path: 'M 50 15 Q 50 10 50 15 Q 72 25 75 55 Q 75 80 50 88 Q 25 80 25 55 Q 28 25 50 15 Z',
    previewColor: '#8b5cf6',
  },

  // ── Adults ───────────────────────────────────────────────────────────────

  {
    id: 'catti',
    name: 'Catti',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Oval body with cat ears
    path: `M 68 72 L 58 48 L 82 62 Z
           M 132 72 L 142 48 L 118 62 Z
           M 100 60 A 45 60 0 1 1 100 180 A 45 60 0 1 1 100 60 Z`,
    previewColor: '#f97316',
  },

  {
    id: 'owli',
    name: 'Owli',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Round owl body with ear tufts
    path: `M 65 60 L 55 35 L 80 55 Z
           M 135 60 L 145 35 L 120 55 Z
           M 100 50 A 60 60 0 1 1 100 170 A 60 60 0 1 1 100 50 Z`,
    previewColor: '#78716c',
  },

  {
    id: 'froggi',
    name: 'Froggi',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Flattened oval frog body
    path: 'M 100 70 A 70 50 0 1 1 100 170 A 70 50 0 1 1 100 70 Z',
    previewColor: '#22c55e',
  },

  {
    id: 'droppi',
    name: 'Droppi',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Water drop shape
    path: 'M 100 40 Q 100 30 100 40 Q 135 60 140 110 Q 140 150 100 165 Q 60 150 60 110 Q 65 60 100 40 Z',
    previewColor: '#06b6d4',
  },

  {
    id: 'flammi',
    name: 'Flammi',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Flame shape
    path: 'M 100 160 Q 60 140 50 110 Q 45 80 70 60 Q 80 40 100 25 Q 120 40 130 60 Q 155 80 150 110 Q 140 140 100 160 Z',
    previewColor: '#f97316',
  },

  {
    id: 'crysti',
    name: 'Crysti',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Hexagonal crystal
    path: 'M 100 50 L 140 80 L 140 130 L 100 160 L 60 130 L 60 80 Z',
    previewColor: '#a855f7',
  },

  {
    id: 'cloudi',
    name: 'Cloudi',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Cloud shape - multiple overlapping circles merged into one path
    path: `M 55 120 
           A 35 35 0 0 1 75 75 
           A 25 25 0 0 1 100 55 
           A 30 30 0 0 1 130 55
           A 25 25 0 0 1 145 75
           A 35 35 0 0 1 160 110
           A 45 45 0 0 1 145 155
           Q 100 175 55 155
           A 35 35 0 0 1 55 120 Z`,
    previewColor: '#e2e8f0',
  },

  {
    id: 'mushie',
    name: 'Mushie',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Mushroom shape - dome cap with stem
    path: `M 40 100 
           Q 40 50 100 50 
           Q 160 50 160 100 
           Q 160 115 140 115
           L 130 115 L 130 160 Q 130 170 100 170 Q 70 170 70 160 L 70 115
           L 60 115 Q 40 115 40 100 Z`,
    previewColor: '#ef4444',
  },

  {
    id: 'starri',
    name: 'Starri',
    category: 'adult',
    viewBox: '0 0 200 200',
    // 5-pointed star
    path: `M 100 30
           L 115 75 L 165 80 L 128 115 L 140 165
           L 100 140 L 60 165 L 72 115 L 35 80
           L 85 75 Z`,
    previewColor: '#fbbf24',
  },

  {
    id: 'pandi',
    name: 'Pandi',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Panda - round body with round ears
    path: `M 65 55 A 20 20 0 1 1 65 95 A 20 20 0 1 1 65 55 Z
           M 135 55 A 20 20 0 1 1 135 95 A 20 20 0 1 1 135 55 Z
           M 100 60 A 55 60 0 1 1 100 180 A 55 60 0 1 1 100 60 Z`,
    previewColor: '#fafafa',
  },

  {
    id: 'cacti',
    name: 'Cacti',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Cactus shape with arms
    path: `M 85 50 L 85 170 Q 85 180 100 180 Q 115 180 115 170 L 115 50 Q 115 35 100 35 Q 85 35 85 50 Z
           M 55 90 Q 45 90 45 105 L 45 130 Q 45 140 55 140 L 55 140 Q 65 140 65 130 L 65 115 L 85 115 L 85 90 L 65 90 Q 65 90 55 90 Z
           M 145 100 Q 155 100 155 115 L 155 140 Q 155 150 145 150 L 145 150 Q 135 150 135 140 L 135 125 L 115 125 L 115 100 L 135 100 Q 135 100 145 100 Z`,
    previewColor: '#22c55e',
  },

  {
    id: 'breezy',
    name: 'Breezy',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Leaf shape
    path: 'M 100 30 Q 160 60 160 120 Q 160 170 100 180 Q 40 170 40 120 Q 40 60 100 30 Z',
    previewColor: '#4ade80',
  },

  {
    id: 'leafy',
    name: 'Leafy',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Round leaf/plant shape
    path: 'M 100 40 Q 150 50 160 100 Q 165 150 100 170 Q 35 150 40 100 Q 50 50 100 40 Z',
    previewColor: '#86efac',
  },

  {
    id: 'rocky',
    name: 'Rocky',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Rock/boulder shape - irregular rounded polygon
    path: 'M 70 50 L 130 45 L 165 80 L 170 130 L 140 165 L 60 170 L 35 130 L 40 75 Z',
    previewColor: '#a8a29e',
  },

  {
    id: 'rosey',
    name: 'Rosey',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Rose/flower shape - rounded with petal edges
    path: `M 100 35 
           Q 130 35 145 55 Q 165 65 165 100 
           Q 165 135 145 150 Q 130 170 100 170 
           Q 70 170 55 150 Q 35 135 35 100 
           Q 35 65 55 55 Q 70 35 100 35 Z`,
    previewColor: '#fb7185',
  },

  {
    id: 'bloomi',
    name: 'Bloomi',
    category: 'adult',
    viewBox: '0 0 200 200',
    // Flower with petals around center
    path: `M 100 35 A 25 25 0 1 1 100 85 A 25 25 0 1 1 100 35 Z
           M 145 65 A 25 25 0 1 1 145 115 A 25 25 0 1 1 145 65 Z
           M 145 105 A 25 25 0 1 1 145 155 A 25 25 0 1 1 145 105 Z
           M 100 135 A 25 25 0 1 1 100 185 A 25 25 0 1 1 100 135 Z
           M 55 105 A 25 25 0 1 1 55 155 A 25 25 0 1 1 55 105 Z
           M 55 65 A 25 25 0 1 1 55 115 A 25 25 0 1 1 55 65 Z
           M 100 80 A 30 30 0 1 1 100 140 A 30 30 0 1 1 100 80 Z`,
    previewColor: '#f472b6',
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

/** Cache for generated mask URLs */
const blobbiMaskCache = new Map<string, string>();

/**
 * Generate a PNG mask URL for a Blobbi shape.
 * The mask is white with alpha from the shape path.
 */
export function getBlobbiMaskUrl(shapeId: string): string {
  const cached = blobbiMaskCache.get(shapeId);
  if (cached) return cached;

  const shape = getBlobbiShape(shapeId);
  if (!shape) return '';

  // Parse viewBox
  const vb = shape.viewBox.split(' ').map(Number);
  const [, , vbWidth, vbHeight] = vb;

  // Create canvas
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Scale to fit canvas
  const scale = size / Math.max(vbWidth, vbHeight);
  const offsetX = (size - vbWidth * scale) / 2;
  const offsetY = (size - vbHeight * scale) / 2;

  // Draw shape as white filled path
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Create path from SVG path data
  const path = new Path2D(shape.path);
  ctx.fillStyle = 'white';
  ctx.fill(path);

  ctx.restore();

  // Export as PNG
  const url = canvas.toDataURL('image/png');
  blobbiMaskCache.set(shapeId, url);
  return url;
}
