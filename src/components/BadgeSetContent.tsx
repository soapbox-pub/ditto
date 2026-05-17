import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { Skeleton } from '@/components/ui/skeleton';
import { useBadgeDefinitions } from '@/hooks/useBadgeDefinitions';
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
  const badgeSet = useMemo(() => parseBadgeSet(event), [event]);

  // Fetch all referenced badge definitions. The shared hook groups refs by
  // author so a set with N badges from one issuer sends one filter (with
  // `#d: [...identifiers]`) instead of N filters — important for large sets
  // like RetroAchievements game-completion lists with 100+ entries.
  const badgeRefs = useMemo(
    () => badgeSet?.badges.map((b) => ({ pubkey: b.pubkey, identifier: b.identifier })) ?? [],
    [badgeSet],
  );
  const { badgeMap, isLoading: isLoadingDefs } = useBadgeDefinitions(badgeRefs);

  const [expanded, setExpanded] = useState(false);

  if (!badgeSet) return null;

  const { badges, image, description, title } = badgeSet;
  const hasOverflow = badges.length > PREVIEW_LIMIT;
  const visibleLimit = hasOverflow ? PREVIEW_LIMIT - 1 : PREVIEW_LIMIT;
  const remaining = Math.max(0, badges.length - visibleLimit);
  const showRefs = expanded ? badges : badges.slice(0, visibleLimit);

  return (
    <div className="mt-3 space-y-3">
      {/* Set hero — full-bleed poster when an image is provided, otherwise a
          minimalist text-only header. The image is treated as cover art:
          letterboxed at a wide aspect ratio with a dark gradient so the
          title and description remain legible on top. */}
      {image ? (
        <div className="relative isolate overflow-hidden rounded-2xl border border-border bg-black">
          <div className="aspect-[3/1] w-full">
            <img
              src={image}
              alt={title}
              className="size-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
          {/* Bottom-up gradient for legibility */}
          <div
            className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/85 via-black/30 to-transparent"
            aria-hidden="true"
          />
          {/* Text overlay */}
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 text-white">
            <h3 className="text-xl sm:text-2xl font-bold leading-tight drop-shadow-md break-words">
              {title}
            </h3>
            {description && (
              <p className="text-sm text-white/85 mt-1.5 leading-snug line-clamp-2 drop-shadow break-words">
                {description}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-transparent to-primary/5 px-5 py-6">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Award className="size-3.5" />
            Badge set
          </div>
          <h3 className="text-xl font-bold mt-1.5 leading-tight break-words">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed line-clamp-3 break-words">
              {description}
            </p>
          )}
        </div>
      )}

      {/* Badge grid */}
      {isLoadingDefs ? (
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
