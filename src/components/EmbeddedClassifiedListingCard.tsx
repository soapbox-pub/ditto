import { useMemo } from 'react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { Tag } from 'lucide-react';

import { EmbeddedCardShell } from '@/components/EmbeddedCardShell';
import { parseClassifiedListing, formatListingPrice } from '@/lib/classifiedListing';
import { cn } from '@/lib/utils';

interface EmbeddedClassifiedListingCardProps {
  event: NostrEvent;
  className?: string;
  /** When true, ProfileHoverCards inside the card are disabled (avoids nesting). */
  disableHoverCards?: boolean;
}

/**
 * Compact inline card for NIP-99 classified listings (kind 30402), used in
 * quote embeds and naddr mentions. Mirrors the feed card's invoice-style
 * commerce layout — square product photo on the left, "For Sale" pill row
 * and a bold price on the right — scaled down to embed size. Callers route
 * malformed listings (no title) to the generic naddr card, so this component
 * returns `null` for them.
 */
export function EmbeddedClassifiedListingCard({ event, className, disableHoverCards }: EmbeddedClassifiedListingCardProps) {
  const listing = useMemo(() => parseClassifiedListing(event), [event]);

  const naddrId = useMemo(() => {
    const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
  }, [event]);

  if (!listing) return null;

  const { title, images, price, status } = listing;
  const cover = images[0];
  const isSold = status === 'sold';
  const priceLabel = price ? formatListingPrice(price) : undefined;

  return (
    <EmbeddedCardShell
      pubkey={event.pubkey}
      createdAt={event.created_at}
      navigateTo={naddrId}
      className={className}
      disableHoverCards={disableHoverCards}
    >
      <div className="relative isolate flex items-center gap-3 overflow-hidden rounded-xl py-1.5">
        {/* Subtle accent glow behind the photo corner */}
        <div className="absolute -z-10 top-0 left-0 size-24 rounded-full bg-primary/[0.06] blur-2xl" aria-hidden="true" />

        {/* Product photo — square thumbnail */}
        {cover && (
          <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:size-24">
            <img
              src={cover}
              alt=""
              loading="lazy"
              decoding="async"
              className={cn('absolute inset-0 size-full object-cover', isSold && 'opacity-60 grayscale')}
            />
          </div>
        )}

        {/* Info column */}
        <div className="min-w-0 flex-1 space-y-0.5">
          {/* Label row */}
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <Tag className="size-3 text-primary" />
            </span>
            {isSold ? 'Sold' : 'For Sale'}
          </div>

          {/* Price */}
          {priceLabel && (
            <div
              className={cn(
                'whitespace-nowrap text-xl font-bold leading-tight tracking-tight',
                isSold && 'text-muted-foreground line-through decoration-2',
              )}
            >
              {priceLabel}
            </div>
          )}

          {/* Title */}
          <p dir="auto" className="line-clamp-2 break-words text-sm font-medium leading-snug">
            {title}
          </p>
        </div>
      </div>
    </EmbeddedCardShell>
  );
}
