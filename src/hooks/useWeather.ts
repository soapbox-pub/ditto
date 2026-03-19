import { useQuery } from '@tanstack/react-query';

import { getCoordinates } from '@/lib/coordinates';

/** WMO weather interpretation codes → descriptions and icons. */
const WMO_CODES: Record<number, { description: string; icon: string }> = {
  0: { description: 'Clear sky', icon: '☀️' },
  1: { description: 'Mainly clear', icon: '🌤️' },
  2: { description: 'Partly cloudy', icon: '⛅' },
  3: { description: 'Overcast', icon: '☁️' },
  45: { description: 'Foggy', icon: '🌫️' },
  48: { description: 'Depositing rime fog', icon: '🌫️' },
  51: { description: 'Light drizzle', icon: '🌦️' },
  53: { description: 'Moderate drizzle', icon: '🌦️' },
  55: { description: 'Dense drizzle', icon: '🌧️' },
  56: { description: 'Light freezing drizzle', icon: '🌧️' },
  57: { description: 'Dense freezing drizzle', icon: '🌧️' },
  61: { description: 'Slight rain', icon: '🌦️' },
  63: { description: 'Moderate rain', icon: '🌧️' },
  65: { description: 'Heavy rain', icon: '🌧️' },
  66: { description: 'Light freezing rain', icon: '🌧️' },
  67: { description: 'Heavy freezing rain', icon: '🌧️' },
  71: { description: 'Slight snowfall', icon: '🌨️' },
  73: { description: 'Moderate snowfall', icon: '🌨️' },
  75: { description: 'Heavy snowfall', icon: '❄️' },
  77: { description: 'Snow grains', icon: '❄️' },
  80: { description: 'Slight rain showers', icon: '🌦️' },
  81: { description: 'Moderate rain showers', icon: '🌧️' },
  82: { description: 'Violent rain showers', icon: '🌧️' },
  85: { description: 'Slight snow showers', icon: '🌨️' },
  86: { description: 'Heavy snow showers', icon: '❄️' },
  95: { description: 'Thunderstorm', icon: '⛈️' },
  96: { description: 'Thunderstorm with slight hail', icon: '⛈️' },
  99: { description: 'Thunderstorm with heavy hail', icon: '⛈️' },
};

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
  /** Human-readable weather description. */
  description: string;
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
    const wmo = WMO_CODES[code] ?? { description: 'Unknown', icon: '🌡️' };

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
