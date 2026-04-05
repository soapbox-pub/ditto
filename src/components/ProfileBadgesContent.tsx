import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { parseBadgeDefinition, type BadgeData } from '@/lib/parseBadgeDefinition';
import { parseProfileBadges } from '@/lib/parseProfileBadges';
import { BadgeThumbnail } from '@/components/BadgeThumbnail';

/** Maximum badges to show in the preview grid before truncating. */
const PREVIEW_LIMIT = 12;

interface ProfileBadgesContentProps {
  event: NostrEvent;
}

/**
 * Renders a NIP-58 profile badges event (kind 10008 or legacy 30008) as an inline card in the feed.
 * Shows a grid of the user's accepted badges with images and names.
 */
export function ProfileBadgesContent({ event }: ProfileBadgesContentProps) {
  const { nostr } = useNostr();
  const badgeRefs = useMemo(() => parseProfileBadges(event), [event]);

  // Fetch all referenced badge definitions in a single query
  const badgeDefsQuery = useQuery({
    queryKey: ['badge-definitions', badgeRefs.map((r) => r.aTag).join(',')],
    queryFn: async () => {
      if (badgeRefs.length === 0) return [];

      // Build filters for each badge definition
      const filters = badgeRefs.map((ref) => ({
        kinds: [30009 as const],
        authors: [ref.pubkey],
        '#d': [ref.identifier],
        limit: 1,
      }));

      const events = await nostr.query(filters);
      return events;
    },
    enabled: badgeRefs.length > 0,
    staleTime: 5 * 60_000,
  });

  // Build a lookup map from a-tag to parsed badge data
  const badgeMap = useMemo(() => {
    const map = new Map<string, BadgeData>();
    if (!badgeDefsQuery.data) return map;
    for (const event of badgeDefsQuery.data) {
      const parsed = parseBadgeDefinition(event);
      if (!parsed) continue;
      const aTag = `30009:${event.pubkey}:${parsed.identifier}`;
      map.set(aTag, parsed);
    }
    return map;
  }, [badgeDefsQuery.data]);

  const [expanded, setExpanded] = useState(false);

  if (badgeRefs.length === 0) return null;

  // When overflowing, reserve one grid cell for the "+N" indicator
  const hasOverflow = badgeRefs.length > PREVIEW_LIMIT;
  const visibleLimit = hasOverflow ? PREVIEW_LIMIT - 1 : PREVIEW_LIMIT;
  const remaining = Math.max(0, badgeRefs.length - visibleLimit);
  const showRefs = expanded ? badgeRefs : badgeRefs.slice(0, visibleLimit);

  return (
    <div className="mt-3 space-y-3">
      {/* Badge grid */}
      {badgeDefsQuery.isLoading ? (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
          {badgeRefs.slice(0, visibleLimit).map((ref, idx) => (
            <div key={`${ref.aTag}-${idx}`} className="flex flex-col items-center gap-1.5">
              <Skeleton className="size-12 rounded-lg" />
              <Skeleton className="h-2.5 w-12" />
            </div>
          ))}
          {hasOverflow && (
            <div className="flex flex-col items-center justify-center gap-1.5">
              <Skeleton className="size-12 rounded-lg" />
            </div>
          )}
        </div>
      ) : showRefs.length > 0 ? (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
          {showRefs.map((ref, idx) => {
            const badge = badgeMap.get(ref.aTag);
            const badgeUrl = `/${nip19.naddrEncode({ kind: 30009, pubkey: ref.pubkey, identifier: ref.identifier })}`;

            return (
              <Link
                key={`${ref.aTag}-${idx}`}
                to={badgeUrl}
                className="flex flex-col items-center gap-1.5 group"
                title={badge?.description || badge?.name || ref.identifier}
                onClick={(e) => e.stopPropagation()}
              >
                {badge ? (
                  <BadgeThumbnail badge={badge} size={48} />
                ) : (
                  <div className="size-12 rounded-lg border border-border bg-background flex items-center justify-center">
                    <Award className="size-6 text-muted-foreground" />
                  </div>
                )}
                <span className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2 max-w-[4.5rem] group-hover:text-foreground transition-colors">
                  {badge?.name || ref.identifier}
                </span>
              </Link>
            );
          })}
          {remaining > 0 && !expanded && (
            <button
              className="flex flex-col items-center justify-center gap-1.5"
              onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
            >
              <div className="size-12 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center text-muted-foreground text-xs font-medium transition-colors">
                +{remaining}
              </div>
            </button>
          )}
        </div>
      ) : badgeRefs.length > 0 ? (
        <div className="rounded-xl border border-border bg-secondary/30 p-4 text-center text-sm text-muted-foreground">
          {badgeRefs.length} badge{badgeRefs.length !== 1 ? 's' : ''} referenced but definitions could not be loaded.
        </div>
      ) : null}
    </div>
  );
}
