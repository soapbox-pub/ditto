import { nip19 } from 'nostr-tools';

export const WEATHER_STATION_METADATA_KIND = 16158;
export const WEATHER_STATION_READING_KIND = 4223;

export interface WeatherStationRef {
  pubkey: string;
  stationId?: string;
  raw: string;
}

export type WeatherUnitSystem = 'normal' | 'hamburger';

/** Field labels that should be treated as weather station references. */
export function isWeatherFieldLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return normalized === 'weather' || normalized === 'weather station';
}

/**
 * Parse a weather station reference from profile fields.
 *
 * Supported inputs:
 * - npub / nprofile (station pubkey)
 * - naddr (kind 16158, carries station pubkey + identifier)
 * - 64-char hex pubkey
 * - Any of the above with "#<station-id>" suffix
 */
export function parseWeatherStationRef(input: string): WeatherStationRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const withoutPrefix = trimmed.startsWith('nostr:') ? trimmed.slice('nostr:'.length) : trimmed;
  const hashIdx = withoutPrefix.indexOf('#');
  const base = hashIdx >= 0 ? withoutPrefix.slice(0, hashIdx) : withoutPrefix;
  const suffixStationId = hashIdx >= 0 ? withoutPrefix.slice(hashIdx + 1).trim() : '';

  const asHexPubkey = /^[0-9a-f]{64}$/i.test(base) ? base.toLowerCase() : undefined;
  if (asHexPubkey) {
    return {
      pubkey: asHexPubkey,
      stationId: suffixStationId || undefined,
      raw: input,
    };
  }

  try {
    const decoded = nip19.decode(base);

    if (decoded.type === 'npub') {
      return {
        pubkey: decoded.data,
        stationId: suffixStationId || undefined,
        raw: input,
      };
    }

    if (decoded.type === 'nprofile') {
      return {
        pubkey: decoded.data.pubkey,
        stationId: suffixStationId || undefined,
        raw: input,
      };
    }

    if (decoded.type === 'naddr') {
      const stationId = suffixStationId || decoded.data.identifier || undefined;
      return {
        pubkey: decoded.data.pubkey,
        stationId,
        raw: input,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function firstNumeric(value: string): number | null {
  const match = value.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasUnitSuffix(value: string): boolean {
  return /[a-z%]/i.test(value.replace(/-?\d+(\.\d+)?/g, ''));
}

function round(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function normalizedSensorKey(sensorKey: string): string {
  return sensorKey.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Format a sensor reading with optional unit conversion.
 *
 * "normal" = metric-friendly defaults.
 * "hamburger" = imperial-friendly defaults.
 */
export function formatWeatherSensorValue(
  sensorKey: string,
  rawValue: string,
  unitSystem: WeatherUnitSystem,
): string {
  const key = normalizedSensorKey(sensorKey);
  const numeric = firstNumeric(rawValue);
  if (numeric === null) return rawValue;

  const rawHasUnits = hasUnitSuffix(rawValue);

  if (key === 'temperature' || key === 'temp') {
    if (unitSystem === 'hamburger') {
      const fahrenheit = (numeric * 9) / 5 + 32;
      return `${round(fahrenheit, 1)}${rawHasUnits ? '' : '°F'}`;
    }
    return `${round(numeric, 1)}${rawHasUnits ? '' : '°C'}`;
  }

  if (key === 'pressure') {
    if (unitSystem === 'hamburger') {
      const inHg = numeric * 0.0295299831;
      return `${round(inHg, 2)}${rawHasUnits ? '' : ' inHg'}`;
    }
    return `${round(numeric, 1)}${rawHasUnits ? '' : ' hPa'}`;
  }

  if (key === 'rain' || key === 'precipitation') {
    if (unitSystem === 'hamburger') {
      const inches = numeric / 25.4;
      return `${round(inches, 2)}${rawHasUnits ? '' : ' in'}`;
    }
    return `${round(numeric, 1)}${rawHasUnits ? '' : ' mm'}`;
  }

  if (key === 'wind_speed' || key === 'windspeed') {
    if (unitSystem === 'hamburger') {
      const mph = numeric * 2.2369362921;
      return `${round(mph, 1)}${rawHasUnits ? '' : ' mph'}`;
    }
    return `${round(numeric, 1)}${rawHasUnits ? '' : ' m/s'}`;
  }

  if (key === 'wave_height') {
    if (unitSystem === 'hamburger') {
      const feet = numeric * 3.280839895;
      return `${round(feet, 1)}${rawHasUnits ? '' : ' ft'}`;
    }
    return `${round(numeric, 1)}${rawHasUnits ? '' : ' m'}`;
  }

  if (key === 'humidity') {
    return `${round(numeric, 0)}${rawHasUnits ? '' : '%'}`;
  }

  return rawValue;
}
