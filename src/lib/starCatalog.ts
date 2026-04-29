/**
 * Hipparcos star catalog for Birdstar kind 30621 (Custom Constellation)
 * rendering.
 *
 * Data is bundled from the `d3-celestial` npm package (BSD-3-Clause, Olaf
 * Frohn), which in turn pulls from:
 *
 *   - ESA's Hipparcos mission catalog (positions, magnitudes)
 *   - IAU Catalog of Star Names (proper names)
 *
 * Attribution: https://github.com/ofrohn/d3-celestial
 *
 * The raw GeoJSON is ~1.3 MB combined, so this module is only ever imported
 * dynamically (see `ConstellationContent`) — it must never appear in the
 * main bundle.
 */

import starsGeoJson from 'd3-celestial/data/stars.6.json';
import starnamesJson from 'd3-celestial/data/starnames.json';

// ---------------------------------------------------------------------------
// Source-data types
// ---------------------------------------------------------------------------

interface StarFeature {
  type: 'Feature';
  id: number; // HIP catalog number
  properties: { mag: number };
  geometry: { type: 'Point'; coordinates: [number, number] }; // [RA°, Dec°]
}

interface StarsCollection {
  type: 'FeatureCollection';
  features: StarFeature[];
}

interface StarNameEntry {
  name?: string;
  bayer?: string;
  c?: string; // 3-letter IAU constellation code
}

type StarNames = Record<string, StarNameEntry>;

const RAW_STARS = starsGeoJson as unknown as StarsCollection;
const RAW_NAMES = starnamesJson as unknown as StarNames;

// ---------------------------------------------------------------------------
// Public Star type
// ---------------------------------------------------------------------------

export interface Star {
  /** Hipparcos catalog number — stable, used as the wire identifier. */
  hip: number;
  /** IAU / traditional proper name, if any. */
  name?: string;
  /** Bayer designation (Greek letter, pre-encoded as Unicode). */
  bayer?: string;
  /** 3-letter IAU constellation code (e.g. "CMa"). */
  constellation?: string;
  /** Right ascension in hours, 0..24. */
  ra: number;
  /** Declination in degrees, -90..90. */
  dec: number;
  /** Apparent visual magnitude. */
  mag: number;
}

// ---------------------------------------------------------------------------
// Build the catalog once at module-load time.
// ---------------------------------------------------------------------------

const STARS_BY_HIP = new Map<number, Star>();

for (const f of RAW_STARS.features) {
  const hip = f.id;
  if (typeof hip !== 'number' || !Number.isFinite(hip) || hip <= 0) continue;
  const mag = Number(f.properties.mag);
  if (!Number.isFinite(mag)) continue;

  const [lon, lat] = f.geometry.coordinates;
  // d3-celestial encodes RA in degrees [0, 360). Convert to hours.
  const ra = ((lon + 360) % 360) / 15;
  const dec = lat;

  const entry = RAW_NAMES[String(hip)];
  STARS_BY_HIP.set(hip, {
    hip,
    name: entry?.name || undefined,
    bayer: entry?.bayer || undefined,
    constellation: entry?.c || undefined,
    ra,
    dec,
    mag,
  });
}

/** Resolve a star by HIP number. Returns undefined if unknown. */
export function starByHip(hip: number): Star | undefined {
  return STARS_BY_HIP.get(hip);
}
