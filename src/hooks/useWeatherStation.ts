import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import {
  parseWeatherStationRef,
  WEATHER_STATION_METADATA_KIND,
  WEATHER_STATION_READING_KIND,
} from '@/lib/weatherStation';

export interface WeatherSensorReading {
  key: string;
  label: string;
  value: string;
  model?: string;
}

export interface WeatherStationData {
  stationName?: string;
  stationDescription?: string;
  observedAt: number;
  eventId: string;
  sensors: WeatherSensorReading[];
}

const SENSOR_LABELS: Record<string, string> = {
  temperature: 'Temperature',
  humidity: 'Humidity',
  pressure: 'Pressure',
  wind_speed: 'Wind speed',
  wind_direction: 'Wind direction',
  rain: 'Rain',
  wave_height: 'Wave height',
  wave_period: 'Wave period',
  wave_direction: 'Wave direction',
  air_quality: 'Air quality',
};

const RESERVED_TAGS = new Set([
  'id', 'alt', 'client', 's', 'd', 'g', 'p', 'e', 'a', 't', 'nonce', 'expiration', 'observed_at', 'sensor_status',
]);

function tagValue(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([tagName]) => tagName === name)?.[1];
}

function parseObservedAt(event: NostrEvent): number {
  const raw = tagValue(event, 'observed_at');
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return event.created_at;
}

function parseSensors(event: NostrEvent): WeatherSensorReading[] {
  const sensors: WeatherSensorReading[] = [];

  for (const [sensorKey, value, model] of event.tags) {
    if (!value) continue;

    const knownLabel = SENSOR_LABELS[sensorKey];
    if (knownLabel) {
      sensors.push({ key: sensorKey, label: knownLabel, value, model });
      continue;
    }

    // Fallback for future sensor keys not yet hardcoded.
    if (RESERVED_TAGS.has(sensorKey)) continue;
    if (!/^[a-z0-9_]+$/i.test(sensorKey)) continue;
    if (!/^-?\d+(\.\d+)?([a-z%/]+)?$/i.test(value)) continue;
    sensors.push({ key: sensorKey, label: sensorKey.replace(/_/g, ' '), value, model });
  }

  return sensors;
}

function selectLatestReading(events: NostrEvent[], stationId?: string): NostrEvent | undefined {
  const filtered = stationId
    ? events.filter((event) => {
      const sTag = tagValue(event, 's');
      const dTag = tagValue(event, 'd');
      return sTag === stationId || dTag === stationId;
    })
    : events;

  return [...filtered].sort((a, b) => b.created_at - a.created_at)[0];
}

export function useWeatherStation(stationRefInput: string) {
  const { nostr } = useNostr();
  const stationRef = parseWeatherStationRef(stationRefInput);

  return useQuery<WeatherStationData | null, Error>({
    queryKey: ['weather-station', stationRef?.pubkey ?? '', stationRef?.stationId ?? '', stationRefInput],
    enabled: !!stationRef,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      if (!stationRef) return null;

      const readingFilters: NostrFilter[] = stationRef.stationId
        ? [
          {
            kinds: [WEATHER_STATION_READING_KIND],
            authors: [stationRef.pubkey],
            '#s': [stationRef.stationId],
            limit: 20,
          },
          {
            kinds: [WEATHER_STATION_READING_KIND],
            authors: [stationRef.pubkey],
            '#d': [stationRef.stationId],
            limit: 20,
          },
        ]
        : [{
          kinds: [WEATHER_STATION_READING_KIND],
          authors: [stationRef.pubkey],
          limit: 20,
        }];

      const readingEvents = await nostr.query(readingFilters, { signal });
      const latest = selectLatestReading(readingEvents, stationRef.stationId);
      if (!latest) return null;

      const stationFilter: NostrFilter = {
        kinds: [WEATHER_STATION_METADATA_KIND],
        authors: [stationRef.pubkey],
        limit: 1,
      };
      if (stationRef.stationId) {
        stationFilter['#d'] = [stationRef.stationId];
      }

      const [stationMetaEvent] = await nostr.query([stationFilter], { signal });

      return {
        stationName: tagValue(stationMetaEvent ?? latest, 'name'),
        stationDescription: tagValue(stationMetaEvent ?? latest, 'description'),
        observedAt: parseObservedAt(latest),
        eventId: latest.id,
        sensors: parseSensors(latest),
      };
    },
  });
}
