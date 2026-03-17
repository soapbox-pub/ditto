import {
  Activity,
  CloudRain,
  CloudSun,
  Droplets,
  Gauge,
  Navigation,
  Thermometer,
  Waves,
  Wind,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useWeatherStation } from '@/hooks/useWeatherStation';
import { timeAgo } from '@/lib/timeAgo';
import { formatWeatherSensorValue, parseWeatherStationRef, type WeatherUnitSystem } from '@/lib/weatherStation';

function weatherSensorIcon(sensorKey: string) {
  const key = sensorKey.toLowerCase();
  if (key === 'temperature' || key === 'temp') return Thermometer;
  if (key === 'humidity') return Droplets;
  if (key === 'pressure') return Gauge;
  if (key === 'wind_speed' || key === 'windspeed') return Wind;
  if (key === 'wind_direction' || key === 'wdir') return Navigation;
  if (key === 'rain' || key === 'precipitation') return CloudRain;
  if (key === 'wave_height' || key === 'wave_period' || key === 'wave_direction') return Waves;
  if (key === 'air_quality' || key.startsWith('pm')) return Activity;
  return CloudSun;
}

interface WeatherStationCardProps {
  value: string;
  compact?: boolean;
}

export function WeatherStationCard({ value, compact = false }: WeatherStationCardProps) {
  const stationRef = parseWeatherStationRef(value);
  const { data, isPending } = useWeatherStation(value);
  const [units, setUnits] = useLocalStorage<WeatherUnitSystem>('ditto:weather-units', 'normal');

  if (!stationRef) {
    return (
      <div className={compact ? 'flex items-center gap-1.5 min-w-0' : 'rounded-xl border border-primary/10 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-indigo-500/10 p-3'}>
        <CloudSun className="size-4 shrink-0 text-primary" />
        {compact ? (
          <>
            <span className="text-sm text-muted-foreground">Weather</span>
            <span className="text-sm truncate">Invalid station reference</span>
          </>
        ) : (
          <div>
            <div className="font-semibold text-sm">Weather</div>
            <p className="text-xs text-muted-foreground mt-1">Invalid station reference</p>
          </div>
        )}
      </div>
    );
  }

  if (isPending) {
    return (
      <div className={compact ? 'flex items-center gap-1.5 min-w-0' : 'rounded-xl border border-primary/10 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-indigo-500/10 p-3'}>
        <CloudSun className="size-4 shrink-0 text-primary" />
        {compact ? (
          <>
            <span className="text-sm text-muted-foreground">Weather</span>
            <span className="text-sm truncate">Loading latest reading...</span>
          </>
        ) : (
          <div>
            <div className="font-semibold text-sm">Weather</div>
            <p className="text-xs text-muted-foreground mt-1">Loading latest reading...</p>
          </div>
        )}
      </div>
    );
  }

  if (!data) {
    return (
      <div className={compact ? 'flex items-center gap-1.5 min-w-0' : 'rounded-xl border border-primary/10 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-indigo-500/10 p-3'}>
        <CloudSun className="size-4 shrink-0 text-primary" />
        {compact ? (
          <>
            <span className="text-sm text-muted-foreground">Weather</span>
            <span className="text-sm truncate">No reading found yet</span>
          </>
        ) : (
          <div>
            <div className="font-semibold text-sm">Weather</div>
            <p className="text-xs text-muted-foreground mt-1">No reading found yet</p>
          </div>
        )}
      </div>
    );
  }

  const sensors = compact ? data.sensors.slice(0, 4) : data.sensors.slice(0, 6);

  return (
    <div className={compact ? 'min-w-0 rounded-xl border border-primary/10 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-indigo-500/10 p-2.5' : 'rounded-xl border border-primary/10 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-indigo-500/10 p-3'}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <CloudSun className="size-4 shrink-0 text-primary" />
          <span className={compact ? 'text-sm text-muted-foreground truncate' : 'font-semibold text-sm truncate'}>{data.stationName || 'Weather'}</span>
        </div>
        <Select value={units} onValueChange={(v) => setUnits(v as WeatherUnitSystem)}>
          <SelectTrigger className={compact ? 'h-7 w-[102px] rounded-full bg-background/80 text-[11px]' : 'h-7 w-[106px] rounded-full bg-background/80 text-[11px]'}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="hamburger">Hamburger</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className={compact ? 'text-xs text-muted-foreground mt-0.5' : 'text-xs text-muted-foreground mt-1'}>
        Updated {timeAgo(data.observedAt)} ago
      </p>

      {sensors.length > 0 ? (
        <div className={compact ? 'mt-2 grid grid-cols-2 gap-1.5' : 'mt-2 grid grid-cols-2 gap-1.5 text-xs'}>
          {sensors.map((sensor) => {
            const Icon = weatherSensorIcon(sensor.key);
            return (
              <div key={sensor.key} className={compact ? 'rounded-md border border-primary/10 bg-background/70 px-2 py-1.5' : 'rounded-lg border border-primary/10 bg-background/70 px-2.5 py-2'}>
                <div className={compact ? 'flex items-center gap-1 text-muted-foreground text-[11px]' : 'flex items-center gap-1.5 text-muted-foreground'}>
                  <Icon className={compact ? 'size-3 shrink-0' : 'size-3.5 shrink-0'} />
                  <span className={compact ? 'truncate' : 'truncate text-[11px]'}>{sensor.label}</span>
                </div>
                <div className={compact ? 'text-xs font-semibold truncate' : 'font-semibold truncate text-sm mt-0.5'}>
                  {formatWeatherSensorValue(sensor.key, sensor.value, units)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className={compact ? 'text-sm truncate mt-0.5' : 'text-xs text-muted-foreground mt-2'}>
          No sensor tags in latest reading
        </p>
      )}
    </div>
  );
}
