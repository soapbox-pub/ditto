import { Info } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useClientMetrics } from '@/hooks/useClientMetrics';

interface ClientMetricsProps {
  /** The NIP-89 `client` tag value to fetch metrics for. */
  clientName: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const chartConfig: ChartConfig = {
  count: {
    label: 'Users',
    color: 'hsl(var(--primary))',
  },
};

/**
 * Usage metrics for a single client: Monthly Active Users headline plus a
 * 30-day time-series of active users. Data comes from NIP-45 COUNT queries
 * against the Ditto relay (see `useClientMetrics`).
 *
 * Renders nothing if the relay can't provide the metrics, so the underlying
 * feed remains the focus when stats are unavailable.
 */
export function ClientMetrics({ clientName }: ClientMetricsProps) {
  const { data, isLoading, isError } = useClientMetrics(clientName);

  if (isError) return null;

  return (
    <div className="px-4 pb-2">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            {isLoading || !data ? (
              <Skeleton className="h-8 w-48" />
            ) : (
              <h2 className="text-2xl font-bold tracking-tight">
                {formatNumber(data.mau)}{' '}
                <span className="text-muted-foreground font-medium">Active Users</span>
              </h2>
            )}
            <Popover>
              <PopoverTrigger
                className="shrink-0 -mr-1 -mt-1 rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="About this metric"
              >
                <Info className="size-4" />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 text-sm text-muted-foreground">
                Count of distinct users who posted events in the past 30 days.
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <Skeleton className="h-[200px] w-full" />
          ) : (
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <AreaChart
                data={data.uniqueUsersSeries}
                margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id="fill-unique-users" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={4}
                  width={45}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()
                  }
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#fill-unique-users)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ClientMetrics;
