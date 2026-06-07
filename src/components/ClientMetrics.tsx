import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
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
 * Usage metrics for a single client: Monthly Active Users and a 30-day
 * time-series of Unique Users. Data comes from NIP-45 COUNT queries against
 * the Ditto relay (see `useClientMetrics`).
 *
 * Renders nothing if the relay can't provide the metrics, so the underlying
 * feed remains the focus when stats are unavailable.
 */
export function ClientMetrics({ clientName }: ClientMetricsProps) {
  const { data, isLoading, isError } = useClientMetrics(clientName);

  if (isError) return null;

  return (
    <div className="grid gap-4 px-4 pb-2 md:grid-cols-3">
      {/* MAU */}
      <Card className="md:col-span-1">
        <CardContent className="flex h-full flex-col justify-center p-6">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">MAU</p>
            {isLoading || !data ? (
              <Skeleton className="h-9 w-24" />
            ) : (
              <p className="text-3xl font-bold tracking-tight">
                {formatNumber(data.mau)}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </div>
        </CardContent>
      </Card>

      {/* Active users time series */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Active Users</CardTitle>
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
