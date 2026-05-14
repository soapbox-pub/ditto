import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award } from 'lucide-react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { Skeleton } from '@/components/ui/skeleton';
import { parseBadgeDefinition, type BadgeData } from '@/lib/parseBadgeDefinition';
import { parseBadgeSet } from '@/lib/parseBadgeSet';
import { BadgeThumbnail } from '@/components/BadgeThumbnail';

/** Maximum badges to show in the preview grid before truncating. */
const PREVIEW_LIMIT = 12;

interface BadgeSetContentProps {
  event: NostrEvent;
}

/**
 * Renders a NIP-51 badge set event (kind 30008 with `d != profile_badges`) as
 * an inline card in the feed.
 *
 * Distinct from NIP-58 profile badges (which represent a user's accepted
 * personal showcase): a badge set is a *categorized group* of NIP-58 badges
 * the author has curated — like "Super Mario Bros. badges" — with its own
 * title, description, and optional image.
 */
export function BadgeSetContent({ event }: BadgeSetContentProps) {
  const { nostr } = useNostr();
  const badgeSet = useMemo(() => parseBadgeSet(event), [event]);

  // Fetch all referenced badge definitions in a single query
  const badgeDefsQuery = useQuery({
    queryKey: ['badge-definitions', badgeSet ? badgeSet.badges.map((b) => b.aTag).join(',') : ''],
    queryFn: async () => {
      if (!badgeSet || badgeSet.badges.length === 0) return [];

      const filters = badgeSet.badges.map((ref) => ({
        kinds: [30009 as const],
        authors: [ref.pubkey],
        '#d': [ref.identifier],
        limit: 1,
      }));

      return nostr.query(filters);
    },
    enabled: !!badgeSet && badgeSet.badges.length > 0,
    staleTime: 5 * 60_000,
  });

  // Build a lookup from a-tag → parsed badge data
  const badgeMap = useMemo(() => {
    const map = new Map<string, BadgeData>();
    if (!badgeDefsQuery.data) return map;
    for (const ev of badgeDefsQuery.data) {
      const parsed = parseBadgeDefinition(ev);
      if (!parsed) continue;
      map.set(`30009:${ev.pubkey}:${parsed.identifier}`, parsed);
    }
    return map;
  }, [badgeDefsQuery.data]);

  const [expanded, setExpanded] = useState(false);

  if (!badgeSet) return null;

  const { badges, image, description, title } = badgeSet;
  const hasOverflow = badges.length > PREVIEW_LIMIT;
  const visibleLimit = hasOverflow ? PREVIEW_LIMIT - 1 : PREVIEW_LIMIT;
  const remaining = Math.max(0, badges.length - visibleLimit);
  const showRefs = expanded ? badges : badges.slice(0, visibleLimit);

  return (
    <div className="mt-3 space-y-3">
      {/* Set hero: image (if any) + title + description */}
      <div className="flex gap-3 items-start">
        {image ? (
          <img
            src={image}
            alt={title}
            className="size-16 rounded-lg object-cover shrink-0"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="size-16 rounded-lg bg-gradient-to-br from-primary/10 via-primary/5 to-transparent flex items-center justify-center shrink-0">
            <Award className="size-7 text-primary/40" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-snug break-words">{title}</p>
          {description && (
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed line-clamp-3 break-words">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Badge grid */}
      {badgeDefsQuery.isLoading ? (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
          {badges.slice(0, visibleLimit).map((ref, idx) => (
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
      ) : badges.length > 0 ? (
        <div className="rounded-xl border border-border bg-secondary/30 p-4 text-center text-sm text-muted-foreground">
          {badges.length} badge{badges.length !== 1 ? 's' : ''} referenced but definitions could not be loaded.
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-4 text-center text-sm text-muted-foreground">
          This badge set doesn't reference any badges yet.
        </div>
      )}
    </div>
  );
}
