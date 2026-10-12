import { useQuery } from '@tanstack/react-query';
import { defineMessage, type MessageDescriptor } from 'react-intl';

import { getCoordinates } from '@/lib/coordinates';

/** WMO weather interpretation codes → descriptions and icons. */
const WMO_CODES: Record<number, { description: MessageDescriptor; icon: string }> = {
  0: { description: defineMessage({ id: 'weather.wmo.clearSky', defaultMessage: 'Clear sky' }), icon: '☀️' },
  1: { description: defineMessage({ id: 'weather.wmo.mainlyClear', defaultMessage: 'Mainly clear' }), icon: '🌤️' },
  2: { description: defineMessage({ id: 'weather.wmo.partlyCloudy', defaultMessage: 'Partly cloudy' }), icon: '⛅' },
  3: { description: defineMessage({ id: 'weather.wmo.overcast', defaultMessage: 'Overcast' }), icon: '☁️' },
  45: { description: defineMessage({ id: 'weather.wmo.foggy', defaultMessage: 'Foggy' }), icon: '🌫️' },
  48: { description: defineMessage({ id: 'weather.wmo.depositingRimeFog', defaultMessage: 'Depositing rime fog' }), icon: '🌫️' },
  51: { description: defineMessage({ id: 'weather.wmo.lightDrizzle', defaultMessage: 'Light drizzle' }), icon: '🌦️' },
  53: { description: defineMessage({ id: 'weather.wmo.moderateDrizzle', defaultMessage: 'Moderate drizzle' }), icon: '🌦️' },
  55: { description: defineMessage({ id: 'weather.wmo.denseDrizzle', defaultMessage: 'Dense drizzle' }), icon: '🌧️' },
  56: { description: defineMessage({ id: 'weather.wmo.lightFreezingDrizzle', defaultMessage: 'Light freezing drizzle' }), icon: '🌧️' },
  57: { description: defineMessage({ id: 'weather.wmo.denseFreezingDrizzle', defaultMessage: 'Dense freezing drizzle' }), icon: '🌧️' },
  61: { description: defineMessage({ id: 'weather.wmo.slightRain', defaultMessage: 'Slight rain' }), icon: '🌦️' },
  63: { description: defineMessage({ id: 'weather.wmo.moderateRain', defaultMessage: 'Moderate rain' }), icon: '🌧️' },
  65: { description: defineMessage({ id: 'weather.wmo.heavyRain', defaultMessage: 'Heavy rain' }), icon: '🌧️' },
  66: { description: defineMessage({ id: 'weather.wmo.lightFreezingRain', defaultMessage: 'Light freezing rain' }), icon: '🌧️' },
  67: { description: defineMessage({ id: 'weather.wmo.heavyFreezingRain', defaultMessage: 'Heavy freezing rain' }), icon: '🌧️' },
  71: { description: defineMessage({ id: 'weather.wmo.slightSnowfall', defaultMessage: 'Slight snowfall' }), icon: '🌨️' },
  73: { description: defineMessage({ id: 'weather.wmo.moderateSnowfall', defaultMessage: 'Moderate snowfall' }), icon: '🌨️' },
  75: { description: defineMessage({ id: 'weather.wmo.heavySnowfall', defaultMessage: 'Heavy snowfall' }), icon: '❄️' },
  77: { description: defineMessage({ id: 'weather.wmo.snowGrains', defaultMessage: 'Snow grains' }), icon: '❄️' },
  80: { description: defineMessage({ id: 'weather.wmo.slightRainShowers', defaultMessage: 'Slight rain showers' }), icon: '🌦️' },
  81: { description: defineMessage({ id: 'weather.wmo.moderateRainShowers', defaultMessage: 'Moderate rain showers' }), icon: '🌧️' },
  82: { description: defineMessage({ id: 'weather.wmo.violentRainShowers', defaultMessage: 'Violent rain showers' }), icon: '🌧️' },
  85: { description: defineMessage({ id: 'weather.wmo.slightSnowShowers', defaultMessage: 'Slight snow showers' }), icon: '🌨️' },
  86: { description: defineMessage({ id: 'weather.wmo.heavySnowShowers', defaultMessage: 'Heavy snow showers' }), icon: '❄️' },
  95: { description: defineMessage({ id: 'weather.wmo.thunderstorm', defaultMessage: 'Thunderstorm' }), icon: '⛈️' },
  96: { description: defineMessage({ id: 'weather.wmo.thunderstormWithSlightHail', defaultMessage: 'Thunderstorm with slight hail' }), icon: '⛈️' },
  99: { description: defineMessage({ id: 'weather.wmo.thunderstormWithHeavyHail', defaultMessage: 'Thunderstorm with heavy hail' }), icon: '⛈️' },
};

const UNKNOWN_WMO = {
  description: defineMessage({ id: 'weather.wmo.unknown', defaultMessage: 'Unknown' }),
  icon: '🌡️',
};

export type PrecipitationType = 'rain' | 'snow' | null;

/** Intensity: 'light' | 'moderate' | 'heavy'. */
export type PrecipitationIntensity = 'light' | 'moderate' | 'heavy';

/** Determine the precipitation type and intensity from a WMO code. */
export function getPrecipitation(code: number): { type: PrecipitationType; intensity: PrecipitationIntensity } {
  // Snow codes
  if ([71, 85].includes(code)) return { type: 'snow', intensity: 'light' };
  if ([73].includes(code)) return { type: 'snow', intensity: 'moderate' };
  if ([75, 77, 86].includes(code)) return { type: 'snow', intensity: 'heavy' };

  // Rain codes (including drizzle, freezing rain, showers, thunderstorms)
  if ([51, 56, 61, 80].includes(code)) return { type: 'rain', intensity: 'light' };
  if ([53, 63, 66, 81, 95].includes(code)) return { type: 'rain', intensity: 'moderate' };
  if ([55, 57, 65, 67, 82, 96, 99].includes(code)) return { type: 'rain', intensity: 'heavy' };

  return { type: null, intensity: 'light' };
}

export interface WeatherData {
  /** Current temperature in °C. */
  temperature: number;
  /** Apparent (feels like) temperature in °C. */
  apparentTemperature: number;
  /** Relative humidity percentage. */
  humidity: number;
  /** Wind speed in km/h. */
  windSpeed: number;
  /** WMO weather code. */
  weatherCode: number;
  /** Weather description, formatted for display with `intl.formatMessage`. */
  description: MessageDescriptor;
  /** Weather emoji icon. */
  icon: string;
  /** Whether it's currently daytime. */
  isDay: boolean;
  /** City name for display. */
  city: string;
}

async function fetchWeather(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<Omit<WeatherData, 'city'> | null> {
  try {
    const params = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
      timezone: 'auto',
    });

    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params}`,
      { signal, headers: { Accept: 'application/json' } },
    );

    if (!response.ok) return null;

    const data = await response.json();
    const current = data.current;
    if (!current) return null;

    const code = current.weather_code ?? 0;
    const wmo = WMO_CODES[code] ?? UNKNOWN_WMO;

    return {
      temperature: Math.round(current.temperature_2m),
      apparentTemperature: Math.round(current.apparent_temperature),
      humidity: Math.round(current.relative_humidity_2m),
      windSpeed: Math.round(current.wind_speed_10m),
      weatherCode: code,
      description: wmo.description,
      icon: wmo.icon,
      isDay: current.is_day === 1,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch current weather for an ISO 3166 code (country or subdivision).
 * Uses the free Open-Meteo API (no API key required).
 */
export function useWeather(code: string | null) {
  const coords = code ? getCoordinates(code) : null;

  return useQuery({
    queryKey: ['weather', code],
    queryFn: async ({ signal }): Promise<WeatherData | null> => {
      if (!coords) return null;
      const weather = await fetchWeather(coords.latitude, coords.longitude, signal);
      if (!weather) return null;
      return { ...weather, city: coords.city };
    },
    enabled: !!coords,
    staleTime: 1000 * 60 * 15, // 15 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
    retry: 1,
  });
}
