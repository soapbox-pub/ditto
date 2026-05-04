import { useMemo } from 'react';
import { Bird } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { BirdexTile } from '@/components/BirdexTile';
import { parseBirdexEvent } from '@/lib/parseBirdex';
import { cn } from '@/lib/utils';

/**
 * Birdstar kind 12473 — Birdex (life list).
 *
 * A replaceable per-author index of every distinct bird species the
 * author has ever logged via kind 2473. Each species is a positional
 * `i`/`n` pair (Wikidata entity URI + scientific name), emitted in
 * chronological order of first detection.
 *
 * Feed variant: a small tiled preview of the most recently-added
 * species plus a "+N" capstone, mirroring how kind 3 follow lists
 * render as a compact avatar stack with a "+N more" suffix. Full
 * variant: the whole life list laid out as a responsive grid so
 * visitors can browse every species the author has ever seen.
 */

/** Tiles rendered in the compact feed preview before collapsing into "+N". */
const FEED_PREVIEW_LIMIT = 8;

interface BirdexContentProps {
  event: NostrEvent;
  /**
   * When true, render every species on the life list instead of the
   * truncated feed preview. Used on the post-detail page.
   */
  expanded?: boolean;
  className?: string;
}

export function BirdexContent({ event, expanded, className }: BirdexContentProps) {
  const entries = useMemo(() => parseBirdexEvent(event), [event]);

  // Empty Birdex — either a malformed event or a newly-published
  // placeholder. Render a minimal dashed card so the feed row still
  // has a meaningful anchor.
  if (entries.length === 0) {
    return (
      <div
        className={cn(
          'mt-2 flex items-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground',
          className,
        )}
      >
        <Bird className="size-4" aria-hidden />
        Empty Birdex — no confirmed species yet.
      </div>
    );
  }

  if (expanded) {
    return (
      <div className={cn('mt-2', className)}>
        <div className="mb-3 flex items-center gap-2">
          <Bird className="size-4 text-emerald-600 dark:text-amber-300" aria-hidden />
          <h3 className="text-[15px] font-semibold leading-tight">
            Birdex
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
              {entries.length} species
            </span>
          </h3>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {entries.map((entry) => (
            <BirdexTile
              key={entry.entityUri}
              entityUri={entry.entityUri}
              entityId={entry.entityId}
              scientificName={entry.scientificName || undefined}
            />
          ))}
        </div>
      </div>
    );
  }

  // Feed variant — show the *most recent* species (tail of the list)
  // so the preview reflects the author's latest additions, with an
  // overflow capstone on the final tile when the Birdex is larger
  // than the preview. The capstone displaces one species slot, so
  // when overflowing we render (LIMIT - 1) real tiles + the capstone;
  // the capstone's count is "species not shown", which includes the
  // one species the capstone itself displaced.
  const overflowing = entries.length > FEED_PREVIEW_LIMIT;
  const visibleSpeciesCount = overflowing ? FEED_PREVIEW_LIMIT - 1 : entries.length;
  const previewEntries = entries.slice(-visibleSpeciesCount);
  const overflowCount = entries.length - visibleSpeciesCount;

  return (
    <div className={cn('mt-2', className)}>
      <div className="mb-2 flex items-center gap-2">
        <Bird className="size-4 text-emerald-600 dark:text-amber-300" aria-hidden />
        <span className="text-[15px] font-semibold leading-tight">
          Birdex
        </span>
        <span className="text-sm text-muted-foreground">
          · {entries.length} species
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">
        {previewEntries.map((entry) => (
          <BirdexTile
            key={entry.entityUri}
            entityUri={entry.entityUri}
            entityId={entry.entityId}
            scientificName={entry.scientificName || undefined}
          />
        ))}
        {overflowing && <OverflowTile count={overflowCount} />}
      </div>
    </div>
  );
}

/**
 * Final capstone tile that reads "+N" when the life list overflows
 * the feed preview. Mirrors the "+N more" suffix on kind 3 follow-list
 * avatar stacks.
 */
function OverflowTile({ count }: { count: number }) {
  return (
    <div
      className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/60 text-muted-foreground"
      aria-label={`${count} more species`}
    >
      <span className="text-xs font-semibold sm:text-sm">
        +{count}
      </span>
    </div>
  );
}
