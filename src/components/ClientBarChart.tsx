import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import type { ClientCount } from '@/hooks/useClientCounts';

interface ClientBarChartProps {
  title: string;
  description?: string;
  data: ClientCount[] | undefined;
  isLoading?: boolean;
}

interface ClientBar {
  name: string;
  value: number;
  fill: string;
  /** The `#client` tag value to use for the /client/:name link. */
  client: string;
}

/** Horizontal bar chart comparing a metric across NIP-89 clients. */
export function ClientBarChart({ title, description, data, isLoading }: ClientBarChartProps) {
  const navigate = useNavigate();

  const chartData: ClientBar[] = (data ?? [])
    .filter((d) => d.count > 0)
    .map((d) => ({
      name: d.client.label,
      value: d.count,
      fill: d.client.color,
      // The client feed filters by a single exact `#client` value, so link to
      // the client's primary tag rather than its display label.
      client: d.client.tags[0],
    }));

  const chartConfig: ChartConfig = Object.fromEntries(
    (data ?? []).map((d) => [d.client.label, { label: d.client.label, color: d.client.color }]),
  );

  // Map display label -> primary `#client` tag for the axis-label links.
  const clientByLabel = new Map(chartData.map((d) => [d.name, d.client]));

  const renderTick = ({ x, y, payload }: {
    x: number;
    y: number;
    payload: { value: string };
  }) => {
    const client = clientByLabel.get(payload.value);
    return (
      <text
        x={x}
        y={y}
        dy={3}
        textAnchor="end"
        className="fill-muted-foreground text-xs cursor-pointer hover:fill-foreground"
        onClick={() => {
          if (client) navigate(`/client/${encodeURIComponent(client)}`);
        }}
      >
        {payload.value}
      </text>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {isLoading || chartData.length === 0 ? (
          <Skeleton className="h-[200px] w-full" />
        ) : (
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                className="text-xs"
                tickFormatter={(v: number) => {
                  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
                  return v.toString();
                }}
              />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                className="text-xs"
                width={80}
                tick={renderTick}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                className="cursor-pointer"
                onClick={(entry: ClientBar) => {
                  if (entry?.client) {
                    navigate(`/client/${encodeURIComponent(entry.client)}`);
                  }
                }}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default ClientBarChart;
