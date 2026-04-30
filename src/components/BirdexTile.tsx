import { Bird } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Skeleton } from '@/components/ui/skeleton';
import { useWikidataEntity } from '@/hooks/useWikidataEntity';
import { useWikipediaSummary } from '@/hooks/useWikipediaSummary';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

/**
 * A single tile in a Birdex grid — one species.
 *
 * Resolves Wikidata → English Wikipedia to pull a thumbnail and common
 * name. The scientific name (optional, from the paired `n` tag on the
 * Birdex event) is used as a fallback label while the remote fetch is
 * in flight or fails.
 *
 * Clicking the tile routes to Ditto's external-content page for the
 * species' Wikidata URL, so the species page aggregates detections,
 * comments, and other Birdex authors who have this species on their
 * life lists — the same landing spot used by kind 2473 bird-detection
 * cards.
 */
interface BirdexTileProps {
  entityUri: string;
  entityId: string;
  /** Optional scientific name from the paired `n` tag. */
  scientificName?: string;
  /** Extra classes applied to the tile container. */
  className?: string;
  /** Drop the navigation link (used by disabled-hover embeds). */
  nonInteractive?: boolean;
}

export function BirdexTile({
  entityUri,
  entityId,
  scientificName,
  className,
  nonInteractive,
}: BirdexTileProps) {
  const { data: entity, isLoading: entityLoading } = useWikidataEntity(entityId);
  const wikipediaTitle = entity?.wikipediaTitle ?? null;
  const { data: summary, isLoading: summaryLoading } = useWikipediaSummary(wikipediaTitle);

  const isLoading = entityLoading || summaryLoading;

  // Prefer the Wikipedia page title for the display label; fall back to
  // the scientific name from the Birdex's `n` tag while fetches are in
  // flight or when no English article exists.
  const commonName = summary?.title ?? (scientificName || 'Unknown species');
  const thumbnail = sanitizeUrl(summary?.thumbnail?.source);

  const inner = (
    <div
      className={cn(
        'group relative aspect-square overflow-hidden rounded-xl bg-gradient-to-br from-emerald-100 via-sky-100 to-amber-100 shadow-sm',
        'dark:from-indigo-950 dark:via-indigo-900 dark:to-amber-900/40',
        !nonInteractive && 'transition-shadow hover:shadow-md focus-visible:shadow-md',
        className,
      )}
    >
      {isLoading ? (
        <Skeleton className="absolute inset-0 h-full w-full" />
      ) : thumbnail ? (
        <img
          src={thumbnail}
          alt={commonName}
          className={cn(
            'absolute inset-0 h-full w-full object-cover',
            !nonInteractive && 'motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.03]',
          )}
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Bird
            aria-hidden
            strokeWidth={1.5}
            className="size-8 text-emerald-700/60 dark:text-amber-300/60"
          />
        </div>
      )}

      {/* Name overlay — always rendered, even during skeleton, so the
          tile's shape is stable. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent pt-6">
        <div className="px-2 pb-1.5">
          <p className="truncate text-[11px] font-semibold leading-tight text-white drop-shadow sm:text-xs">
            {isLoading && !scientificName ? '\u00A0' : commonName}
          </p>
          {scientificName && summary?.title && summary.title !== scientificName && (
            <p className="truncate text-[10px] italic leading-tight text-white/80">
              {scientificName}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  if (nonInteractive) return inner;

  return (
    <Link
      to={`/i/${encodeURIComponent(entityUri)}`}
      onClick={(e) => e.stopPropagation()}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
      aria-label={commonName}
    >
      {inner}
    </Link>
  );
}
