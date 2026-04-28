import { lazy, Suspense, useMemo } from 'react';
import { ExternalLink, Sparkles } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { Skeleton } from '@/components/ui/skeleton';
import { openUrl } from '@/lib/downloadFile';
import { cn } from '@/lib/utils';

/**
 * Birdstar kind 30621 — Custom Constellation.
 *
 * An addressable event carrying a user-drawn star-figure: a title, a
 * freeform description in `content`, and one or more `edge` tags referencing
 * pairs of Hipparcos catalog numbers (e.g. `["edge", "32349", "37279"]`).
 *
 * Rendering the figure requires the full Hipparcos star catalog (~1.3 MB),
 * so the preview component is code-split via `lazy()` — the catalog data
 * only loads when a user actually scrolls a constellation event into view.
 */

const ConstellationStarMap = lazy(() =>
  import('./ConstellationStarMap').then((m) => ({ default: m.ConstellationStarMap })),
);

interface ConstellationContentProps {
  event: NostrEvent;
  className?: string;
}

interface ParsedConstellation {
  title: string;
  description: string;
  edges: Array<readonly [number, number]>;
}

function parseConstellation(event: NostrEvent): ParsedConstellation {
  const title = event.tags.find(([n]) => n === 'title')?.[1]
    ?? event.tags.find(([n]) => n === 'd')?.[1]
    ?? 'Untitled constellation';

  const edges: Array<readonly [number, number]> = [];
  for (const tag of event.tags) {
    if (tag[0] !== 'edge' || tag.length < 3) continue;
    const from = Number(tag[1]);
    const to = Number(tag[2]);
    // Reject non-positive-integer HIP numbers per the NIP's validation rules.
    if (!Number.isInteger(from) || from <= 0) continue;
    if (!Number.isInteger(to) || to <= 0) continue;
    edges.push([from, to] as const);
  }

  return {
    title,
    description: event.content.trim(),
    edges,
  };
}

export function ConstellationContent({ event, className }: ConstellationContentProps) {
  const { title, description, edges } = useMemo(() => parseConstellation(event), [event]);

  // Birdstar routes constellations at `/:nip19` using the event's naddr1
  // coordinate (kind 30621 is addressable). Build the link once so we can
  // drop it into a "View on Birdstar" action below the map.
  const birdstarUrl = useMemo(() => {
    const dTag = event.tags.find(([n]) => n === 'd')?.[1];
    if (!dTag) return undefined;
    try {
      const naddr = nip19.naddrEncode({
        kind: event.kind,
        pubkey: event.pubkey,
        identifier: dTag,
      });
      return `https://birdstar.app/${naddr}`;
    } catch {
      return undefined;
    }
  }, [event]);

  return (
    <div className={cn('mt-2', className)}>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
        {/* Star map */}
        <div className="aspect-[4/3] w-full">
          <Suspense fallback={<Skeleton className="size-full" />}>
            <ConstellationStarMap edges={edges} title={title} />
          </Suspense>
        </div>

        {/* Title + description */}
        <div className="space-y-1.5 p-3.5">
          <div className="flex items-center gap-2">
            <Sparkles aria-hidden className="size-3.5 shrink-0 text-amber-500" />
            <h3 className="truncate text-[15px] font-semibold leading-tight">
              {title}
            </h3>
            {birdstarUrl && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openUrl(birdstarUrl);
                }}
                className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                View on Birdstar
                <ExternalLink aria-hidden className="size-3" />
              </button>
            )}
          </div>
          {description && (
            <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
