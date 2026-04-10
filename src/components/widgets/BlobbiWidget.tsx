import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Egg } from 'lucide-react';

import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { useProjectedBlobbiState } from '@/blobbi/core/hooks/useProjectedBlobbiState';
import { useBlobbisCollection } from '@/blobbi/core/hooks/useBlobbisCollection';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Map stat keys to Tailwind color classes. */
const STAT_COLORS: Record<string, string> = {
  hunger: 'bg-orange-500',
  happiness: 'bg-yellow-500',
  health: 'bg-green-500',
  hygiene: 'bg-blue-500',
  energy: 'bg-violet-500',
};

const STAT_LABELS: Record<string, string> = {
  hunger: 'Hunger',
  happiness: 'Happy',
  health: 'Health',
  hygiene: 'Hygiene',
  energy: 'Energy',
};

/** Mini Blobbi widget showing the pet visual + stat bars. */
export function BlobbiWidget() {
  const { user } = useCurrentUser();
  const { companions, isLoading } = useBlobbisCollection();

  // Use the first (active) companion
  const companion = useMemo(() => {
    if (!companions || companions.length === 0) return null;
    // Prefer active companions, then most recently interacted
    return companions.find((c) => c.state === 'active') ?? companions[0];
  }, [companions]);

  if (!user) {
    return (
      <Link to="/blobbi" className="flex flex-col items-center gap-2 py-4 hover:bg-secondary/40 rounded-lg transition-colors">
        <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Egg className="size-8 text-primary" />
        </div>
        <span className="text-xs text-muted-foreground">Log in to hatch your Blobbi</span>
      </Link>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <Skeleton className="size-24 rounded-full" />
        <div className="w-full space-y-2 px-4">
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      </div>
    );
  }

  if (!companion) {
    return (
      <Link to="/blobbi" className="flex flex-col items-center gap-2 py-4 hover:bg-secondary/40 rounded-lg transition-colors">
        <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Egg className="size-8 text-primary" />
        </div>
        <span className="text-sm font-medium text-primary">Hatch your Blobbi</span>
        <span className="text-xs text-muted-foreground">Get your virtual pet companion</span>
      </Link>
    );
  }

  return (
    <Link to="/blobbi" className="block hover:bg-secondary/20 rounded-lg transition-colors">
      <BlobbiWidgetContent companion={companion} />
    </Link>
  );
}

function BlobbiWidgetContent({ companion }: { companion: ReturnType<typeof useBlobbisCollection>['companions'][number] }) {
  const projected = useProjectedBlobbiState(companion);

  return (
    <div className="flex flex-col items-center gap-3 py-3">
      {/* Pet visual */}
      <div className="relative">
        <BlobbiStageVisual
          companion={companion}
          size="lg"
          animated
          lookMode="follow-pointer"
        />
      </div>

      {/* Name */}
      <span className="text-sm font-semibold">{companion.name}</span>

      {/* Stat bars */}
      {projected && projected.visibleStats.length > 0 && (
        <div className="w-full space-y-1.5 px-3">
          {projected.visibleStats.map(({ stat, value, status }) => (
            <div key={stat} className="flex items-center gap-2">
              <span className={cn(
                'text-[10px] w-12 text-right shrink-0',
                status === 'critical' ? 'text-destructive font-bold' :
                status === 'warning' ? 'text-orange-500 font-medium' :
                'text-muted-foreground',
              )}>
                {STAT_LABELS[stat] ?? stat}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-1000',
                    STAT_COLORS[stat] ?? 'bg-primary',
                    status === 'critical' && 'animate-pulse',
                  )}
                  style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
