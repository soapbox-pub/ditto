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

/** Horizontal bar chart comparing a metric across NIP-89 clients. */
export function ClientBarChart({ title, description, data, isLoading }: ClientBarChartProps) {
  const chartData = (data ?? [])
    .filter((d) => d.count > 0)
    .map((d) => ({ name: d.client.label, value: d.count, fill: d.client.color }));

  const chartConfig: ChartConfig = Object.fromEntries(
    (data ?? []).map((d) => [d.client.label, { label: d.client.label, color: d.client.color }]),
  );

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
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default ClientBarChart;
