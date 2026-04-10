import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendSparkline } from '@/components/RightSidebar';
import { useTrendingTags, useTagSparklines } from '@/hooks/useTrending';
import { formatNumber } from '@/lib/formatNumber';

/** Compact trending tags widget for the right sidebar. */
export function TrendingWidget() {
  const { data: trendingTagsResult, isLoading: tagsLoading } = useTrendingTags(true);

  const trendingTags = trendingTagsResult?.tags;
  const labelCreatedAt = trendingTagsResult?.labelCreatedAt ?? 0;

  const visibleTags = useMemo(() => (trendingTags ?? []).slice(0, 5).map((t) => t.tag), [trendingTags]);
  const { data: sparklineData, isLoading: sparklinesLoading } = useTagSparklines(visibleTags, labelCreatedAt, visibleTags.length > 0);

  if (tagsLoading) {
    return (
      <div className="space-y-4 p-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>
    );
  }

  if (!trendingTags || trendingTags.length === 0) {
    return <p className="text-sm text-muted-foreground p-1">No trends available.</p>;
  }

  return (
    <div className="space-y-1">
      {trendingTags.slice(0, 5).map((item) => (
        <Link
          key={item.tag}
          to={`/t/${item.tag}`}
          className="flex items-center justify-between group hover:bg-secondary/40 px-2 py-1.5 rounded-lg transition-colors"
        >
          <div>
            <div className="font-bold text-sm">#{item.tag}</div>
            {item.accounts > 0 && (
              <div className="text-xs text-muted-foreground">
                <span className="text-primary font-semibold">{formatNumber(item.accounts)}</span> people talking
              </div>
            )}
          </div>
          {sparklinesLoading ? (
            <Skeleton className="h-[35px] w-[50px] rounded" />
          ) : (
            <TrendSparkline data={sparklineData?.get(item.tag) ?? []} />
          )}
        </Link>
      ))}
      <div className="pt-1 px-2">
        <Link to="/trends" className="text-xs text-primary hover:underline">View all trends</Link>
      </div>
    </div>
  );
}
