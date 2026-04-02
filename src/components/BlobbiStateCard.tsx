import { useMemo } from 'react';
import { Moon, Sun, Egg, Heart, Sparkles, Droplets, Utensils, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { Badge } from '@/components/ui/badge';
import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { parseBlobbiEvent, KIND_BLOBBI_STATE } from '@/blobbi/core/lib/blobbi';
import { cn } from '@/lib/utils';

/** Compact stat bar for Blobbi stats in the feed card. */
function StatBar({ value, icon: Icon, color }: {
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={cn('size-3 shrink-0', color)} />
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', color.replace('text-', 'bg-'))}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground w-6 text-right">{value}</span>
    </div>
  );
}

const STAT_CONFIG = [
  { key: 'hunger' as const, icon: Utensils, color: 'text-orange-500' },
  { key: 'happiness' as const, icon: Heart, color: 'text-yellow-500' },
  { key: 'health' as const, icon: Sparkles, color: 'text-green-500' },
  { key: 'hygiene' as const, icon: Droplets, color: 'text-blue-500' },
  { key: 'energy' as const, icon: Zap, color: 'text-violet-500' },
];

export function BlobbiStateCard({ event }: { event: NostrEvent }) {
  const companion = useMemo(() => parseBlobbiEvent(event), [event]);

  if (!companion) return null;

  const isSleeping = companion.state === 'sleeping';

  // Build naddr for linking to the detail view
  const dTag = companion.d;
  const naddr = nip19.naddrEncode({
    kind: KIND_BLOBBI_STATE,
    pubkey: event.pubkey,
    identifier: dTag,
  });

  return (
    <div className="mt-2">
      <Link
        to={`/${naddr}`}
        className="block rounded-xl border bg-card/60 p-4 transition-colors hover:bg-accent/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          {/* Blobbi visual */}
          <div className="shrink-0">
            <BlobbiStageVisual
              companion={companion}
              size="sm"
              lookMode="forward"
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Name + badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="font-semibold truncate"
                style={{ color: companion.visualTraits.baseColor }}
              >
                {companion.name}
              </span>
              <Badge variant="secondary" className="text-xs capitalize">
                <Egg className="size-3 mr-1" />
                {companion.stage}
              </Badge>
              <Badge variant={isSleeping ? 'secondary' : 'outline'} className="text-xs">
                {isSleeping ? (
                  <><Moon className="size-3 mr-1" />Sleeping</>
                ) : (
                  <><Sun className="size-3 mr-1" />Active</>
                )}
              </Badge>
            </div>

            {/* Stats (only for baby/adult with visible stats) */}
            {companion.stage !== 'egg' && (
              <div className="space-y-1">
                {STAT_CONFIG.map(({ key, icon, color }) => {
                  const val = companion.stats[key];
                  if (val === undefined) return null;
                  return (
                    <StatBar key={key} value={val} icon={icon} color={color} />
                  );
                })}
              </div>
            )}

            {/* XP + streak for non-egg */}
            {companion.stage !== 'egg' && (companion.experience !== undefined || companion.careStreak !== undefined) && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {companion.experience !== undefined && (
                  <span>XP: {companion.experience}</span>
                )}
                {companion.careStreak !== undefined && companion.careStreak > 0 && (
                  <span>{companion.careStreak}-day streak</span>
                )}
              </div>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
