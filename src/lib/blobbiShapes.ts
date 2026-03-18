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
/**
 * Blobbi Avatar Shapes
 *
 * Defines body silhouettes for Blobbi characters that can be used as avatar masks.
 * Each shape is defined as an SVG path that represents the outer body shape only,
 * without eyes, mouth, or other internal details.
 */

export interface BlobbiShape {
  id: string;
  name: string;
  category: 'egg' | 'baby' | 'adult';
  viewBox: string;
  path: string;
  previewColor?: string;
}

export const BLOBBI_SHAPES: BlobbiShape[] = [
  {
    id: 'egg',
    name: 'Egg',
    category: 'egg',
    viewBox: '0 0 100 100',
    path: 'M 50 8 C 72 8 82 28 82 50 C 82 78 68 92 50 92 C 32 92 18 78 18 50 C 18 28 28 8 50 8 Z',
    previewColor: '#f5f5f4',
  },

  {
    id: 'baby',
    name: 'Baby Blobbi',
    category: 'baby',
    viewBox: '0 0 100 100',
    path: 'M 50 15 Q 72 25 75 55 Q 75 80 50 88 Q 25 80 25 55 Q 28 25 50 15 Z',
    previewColor: '#8b5cf6',
  },

  {
    id: 'bloomi',
    name: 'Bloomi',
    category: 'adult',
    viewBox: '0 0 200 200',
    path: `
      M 100 45
      A 25 25 0 1 1 100 95
      A 25 25 0 1 1 100 45

      M 130 65
      A 25 25 0 1 1 130 115
      A 25 25 0 1 1 130 65

      M 130 105
      A 25 25 0 1 1 130 155
      A 25 25 0 1 1 130 105

      M 100 125
      A 25 25 0 1 1 100 175
      A 25 25 0 1 1 100 125

      M 70 105
      A 25 25 0 1 1 70 155
      A 25 25 0 1 1 70 105

      M 70 65
      A 25 25 0 1 1 70 115
      A 25 25 0 1 1 70 65

      M 100 75
      A 35 35 0 1 1 100 145
      A 35 35 0 1 1 100 75
    `,
    previewColor: '#f472b6',
  },

  {
    id: 'breezy',
    name: 'Breezy',
    category: 'adult',
    viewBox: '0 0 200 200',
    path: `
      M 100 40
      Q 70 60 60 90
      Q 55 120 70 140
      Q 85 155 100 160
      Q 115 155 130 140
      Q 145 120 140 90
      Q 130 60 100 40 Z

      M 65 100
      Q 55 95 50 105
      Q 55 115 65 110 Z

      M 135 100
      Q 145 95 150 105
      Q 145 115 135 110 Z

      M 90 147
      A 10 8 0 1 1 90 163
      A 10 8 0 1 1 90 147

      M 110 147
      A 10 8 0 1 1 110 163
      A 10 8 0 1 1 110 147
    `,
    previewColor: '#4ade80',
  },

  {
    id: 'cacti',
    name: 'Cacti',
    category: 'adult',
    viewBox: '0 0 200 200',
    path: `
      M 85 80
      A 15 15 0 0 1 100 65
      A 15 15 0 0 1 115 80
      L 115 160
      A 15 15 0 0 1 100 175
      A 15 15 0 0 1 85 160
      Z

      M 60 100
      A 10 10 0 0 1 70 90
      L 70 90
      A 10 10 0 0 1 80 100
      L 80 130
      A 10 10 0 0 1 70 140
      A 10 10 0 0 1 60 130
      Z

      M 120 110
      A 10 10 0 0 1 130 100
      L 130 100
      A 10 10 0 0 1 140 110
      L 140 135
      A 10 10 0 0 1 130 145
      A 10 10 0 0 1 120 135
      Z

      M 75 160
      L 125 160
      L 120 175
      L 80 175
      Z

      M 88 63
      A 12 12 0 1 1 112 63
      A 12 12 0 1 1 88 63
      Z
    `,
    previewColor: '#22c55e',
  },

{
  id: 'catti',
  name: 'Catti',
  category: 'adult',
  viewBox: '0 0 200 200',
  path: `
    M 68 72 L 58 48 L 82 62 Z
    M 132 72 L 142 48 L 118 62 Z

    M 100 60
    C 125 60 145 87 145 120
    C 145 153 125 180 100 180
    C 75 180 55 153 55 120
    C 55 87 75 60 100 60 Z

    M 155 150
    Q 165 138 170 128
    Q 178 112 175 98
    Q 172 82 185 70
    Q 190 66 186 60
    Q 180 55 172 60
    Q 155 72 158 92
    Q 161 112 152 128
    Q 146 138 140 147
    Q 146 155 155 150 Z
  `,
  previewColor: '#f97316',
},

  {
    id: 'cloudi',
    name: 'Cloudi',
    category: 'adult',
    viewBox: '0 0 200 200',
    path: `
      M 100 75
      A 30 30 0 1 1 100 135
      A 30 30 0 1 1 100 75

      M 75 75
      A 35 35 0 1 1 75 145
      A 35 35 0 1 1 75 75

      M 125 75
      A 35 35 0 1 1 125 145
      A 35 35 0 1 1 125 75

      M 85 70
      A 25 25 0 1 1 85 120
      A 25 25 0 1 1 85 70

      M 115 70
      A 25 25 0 1 1 115 120
      A 25 25 0 1 1 115 70

      M 100 75
      A 45 45 0 1 1 100 165
      A 45 45 0 1 1 100 75
    `,
    previewColor: '#e2e8f0',
  },

  {
    id: 'crysti',
    name: 'Crysti',
    category: 'adult',
    viewBox: '0 0 200 200',
    path: 'M 100 50 L 140 80 L 140 130 L 100 160 L 60 130 L 60 80 Z',
    previewColor: '#a855f7',
  },

  {
    id: 'droppi',
    name: 'Droppi',
    category: 'adult',
    viewBox: '0 0 200 200',
    path: `
      M 100 40
      Q 135 60 140 110
      Q 140 150 100 165
      Q 60 150 60 110
      Q 65 60 100 40 Z

      M 60 92
      A 10 18 0 1 1 60 128
      A 10 18 0 1 1 60 92

      M 140 92
      A 10 18 0 1 1 140 128
      A 10 18 0 1 1 140 92

      M 85 150
      A 12 10 0 1 1 85 170
      A 12 10 0 1 1 85 150

      M 115 150
      A 12 10 0 1 1 115 170
      A 12 10 0 1 1 115 150
    `,
    previewColor: '#06b6d4',
  },

  {
    id: 'flammi',
    name: 'Flammi',
    category: 'adult',
    viewBox: '0 0 200 200',
    path: `
      M 100 160
      Q 60 140 50 110
      Q 45 80 70 60
      Q 80 40 100 25
      Q 120 40 130 60
      Q 155 80 150 110
      Q 140 140 100 160 Z

      M 55 95
      A 8 15 0 1 1 55 125
      A 8 15 0 1 1 55 95

      M 145 95
      A 8 15 0 1 1 145 125
      A 8 15 0 1 1 145 95

      M 90 147
      A 10 8 0 1 1 90 163
      A 10 8 0 1 1 90 147

      M 110 147
      A 10 8 0 1 1 110 163
      A 10 8 0 1 1 110 147
    `,
    previewColor: '#f97316',
  },

  {
    id: 'froggi',
    name: 'Froggi',
    category: 'adult',
    viewBox: '0 0 200 200',
    path: `
      M 70 53
      A 27 27 0 1 1 70 107
      A 27 27 0 1 1 70 53

      M 130 53
      A 27 27 0 1 1 130 107
      A 27 27 0 1 1 130 53

      M 100 70
      C 170 70 170 170 100 170
      C 30 170 30 70 100 70 Z

      M 60 148
      A 22 12 0 1 1 60 172
      A 22 12 0 1 1 60 148

      M 140 148
      A 22 12 0 1 1 140 172
      A 22 12 0 1 1 140 148
    `,
    previewColor: '#22c55e',
  },

  {
    id: 'leafy',
    name: 'Leafy',
    category: 'adult',
    viewBox: '0 0 200 200',
    path: `
      M 55.00 85.00 A 45 12 0 1 0 145.00 85.00 A 45 12 0 1 0 55.00 85.00 Z
      M 58.43 67.78 A 45 12 22.5 1 0 141.57 102.22 A 45 12 22.5 1 0 58.43 67.78 Z
      M 68.18 53.18 A 45 12 45 1 0 131.82 116.82 A 45 12 45 1 0 68.18 53.18 Z
      M 82.78 43.43 A 45 12 67.5 1 0 117.22 126.57 A 45 12 67.5 1 0 82.78 43.43 Z
      M 100.00 40.00 A 45 12 90 1 0 100.00 130.00 A 45 12 90 1 0 100.00 40.00 Z
      M 117.22 43.43 A 45 12 112.5 1 0 82.78 126.57 A 45 12 112.5 1 0 117.22 43.43 Z
      M 131.82 53.18 A 45 12 135 1 0 68.18 116.82 A 45 12 135 1 0 131.82 53.18 Z
      M 141.57 67.78 A 45 12 157.5 1 0 58.43 102.22 A 45 12 157.5 1 0 141.57 67.78 Z
      M 145.00 85.00 A 45 12 180 1 0 55.00 85.00 A 45 12 180 1 0 145.00 85.00 Z
      M 141.57 102.22 A 45 12 202.5 1 0 58.43 67.78 A 45 12 202.5 1 0 141.57 102.22 Z
      M 131.82 116.82 A 45 12 225 1 0 68.18 53.18 A 45 12 225 1 0 131.82 116.82 Z
      M 117.22 126.57 A 45 12 247.5 1 0 82.78 43.43 A 45 12 247.5 1 0 117.22 126.57 Z
      M 100.00 130.00 A 45 12 270 1 0 100.00 40.00 A 45 12 270 1 0 100.00 130.00 Z
      M 82.78 126.57 A 45 12 292.5 1 0 117.22 43.43 A 45 12 292.5 1 0 82.78 126.57 Z
      M 68.18 116.82 A 45 12 315 1 0 131.82 53.18 A 45 12 315 1 0 68.18 116.82 Z
      M 58.43 102.22 A 45 12 337.5 1 0 141.57 67.78 A 45 12 337.5 1 0 58.43 102.22 Z

      M 96 120
      A 4 4 0 0 1 100 116
      A 4 4 0 0 1 104 120
      L 104 162
      L 96 162
      Z

      M 72.01 147.50
      A 15 8 -30 1 0 97.99 132.50
      A 15 8 -30 1 0 72.01 147.50
      Z

      M 102.01 142.50
      A 15 8 30 1 0 127.99 157.50
      A 15 8 30 1 0 102.01 142.50
      Z

      M 75 158
      A 2 2 0 0 1 77 156
      L 123 156
      A 2 2 0 0 1 125 158
      L 125 165
      L 75 165
      Z

      M 75 160
      L 80 177
      L 120 177
      L 125 160
      Z
    `,
    previewColor: '#fde047',
  },

  {
    id: 'mushie',
    name: 'Mushie',
    category: 'adult',
    viewBox: '0 0 200 200',
    path: `
      M 50 110
      Q 50 70 100 60
      Q 150 70 150 110 Z

      M 100 100
      A 25 40 0 1 1 100 180
      A 25 40 0 1 1 100 100

      M 70 128
      A 8 12 0 1 1 70 152
      A 8 12 0 1 1 70 128

      M 130 128
      A 8 12 0 1 1 130 152
      A 8 12 0 1 1 130 128
    `,
    previewColor: '#ef4444',
  },

  {
    id: 'owli',
    name: 'Owli',
    category: 'adult',
    viewBox: '0 0 200 200',
    path: `
      M 60 70 L 70 48 L 82 70 Z
      M 118 70 L 130 48 L 140 70 Z

      M 100 50
      A 60 60 0 1 1 100 170
      A 60 60 0 1 1 100 50

      M 48 78
      A 16 32 0 1 1 48 142
      A 16 32 0 1 1 48 78

      M 152 78
      A 16 32 0 1 1 152 142
      A 16 32 0 1 1 152 78
    `,
    previewColor: '#78716c',
  },

  {
    id: 'pandi',
    name: 'Pandi',
    category: 'adult',
    viewBox: '0 0 200 200',
    path: `
      M 70 27
      A 18 18 0 1 1 70 63
      A 18 18 0 1 1 70 27

      M 130 27
      A 18 18 0 1 1 130 63
      A 18 18 0 1 1 130 27

      M 100 40
      A 45 45 0 1 1 100 130
      A 45 45 0 1 1 100 40

      M 100 65
      A 55 55 0 1 1 100 175
      A 55 55 0 1 1 100 65

      M 45 105
      A 15 15 0 1 1 45 135
      A 15 15 0 1 1 45 105

      M 155 105
      A 15 15 0 1 1 155 135
      A 15 15 0 1 1 155 105

      M 80 147
      A 18 18 0 1 1 80 183
      A 18 18 0 1 1 80 147

      M 120 147
      A 18 18 0 1 1 120 183
      A 18 18 0 1 1 120 147
    `,
    previewColor: '#fafafa',
  },

  {
    id: 'rocky',
    name: 'Rocky',
    category: 'adult',
    viewBox: '0 0 200 200',
    path: `
      M 100 50
      L 130 70
      L 140 110
      L 130 150
      L 100 165
      L 70 150
      L 60 110
      L 70 70 Z

      M 55 102
      A 12 8 0 1 1 55 118
      A 12 8 0 1 1 55 102

      M 145 102
      A 12 8 0 1 1 145 118
      A 12 8 0 1 1 145 102

      M 85 150
      A 15 10 0 1 1 85 170
      A 15 10 0 1 1 85 150

      M 115 150
      A 15 10 0 1 1 115 170
      A 15 10 0 1 1 115 150
    `,
    previewColor: '#a8a29e',
  },

  {
    id: 'rosey',
    name: 'Rosey',
    category: 'adult',
    viewBox: '0 0 200 200',
    path: `
      M 100 55
      A 35 35 0 1 1 100 125
      A 35 35 0 1 1 100 55
      Z

      M 98 120
      L 102 120
      L 102 166
      L 98 166
      Z

      M 85 137
      A 12 8 0 1 1 85 153
      A 12 8 0 1 1 85 137
      Z

      M 115 142
      A 12 8 0 1 1 115 158
      A 12 8 0 1 1 115 142
      Z

      M 74 166
      L 126 166
      L 120 182
      L 80 182
      Z
    `,
    previewColor: '#fb7185',
  },

  {
    id: 'starri',
    name: 'Starri',
    category: 'adult',
    viewBox: '0 0 200 200',
    path: 'M 100 25 L 115 75 L 165 75 L 125 110 L 140 160 L 100 130 L 60 160 L 75 110 L 35 75 L 85 75 Z',
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
