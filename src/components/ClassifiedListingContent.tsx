import { useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import type { NostrEvent } from '@nostrify/nostrify';
import { ExternalLink, MapPin, Tag } from 'lucide-react';

import { retextSmartypants } from './articleSmartypants';
import { buildMarkdownComponents } from '@/components/markdownComponents';
import { Button } from '@/components/ui/button';
import { openUrl } from '@/lib/downloadFile';
import { displayHost } from '@/lib/sanitizeUrl';
import { parseClassifiedListing, formatListingPrice, listingResidualContent, type ParsedClassifiedListing } from '@/lib/classifiedListing';
import { cn } from '@/lib/utils';

interface ClassifiedListingContentProps {
  event: NostrEvent;
  /** Render the full product-page layout (gallery + buy box + description). */
  expanded?: boolean;
  className?: string;
}

/**
 * Renders a NIP-99 classified listing (kind 30402).
 *
 * Feed mode is a spare product card — photo, price line, title, summary.
 * Expanded (detail) mode is a real marketplace product page: an image
 * gallery with selectable thumbnails on the left, a buy box (price, status,
 * summary, location, view-listing CTA) on the right, and the Markdown
 * description in its own section below.
 *
 * The description is rendered through the Markdown pipeline (NIP-99 content
 * is Markdown by spec) — never through the kind-1 tokenizer, which would
 * auto-linkify URLs/hashtags the listing author didn't intend as mentions.
 */
export function ClassifiedListingContent({ event, expanded, className }: ClassifiedListingContentProps) {
  const listing = useMemo(() => parseClassifiedListing(event), [event]);

  if (!listing) return null;

  return expanded
    ? <ListingDetail listing={listing} className={className} />
    : <ListingFeedCard listing={listing} className={className} />;
}

// ─── Detail (product page) ─────────────────────────────────────

function ListingDetail({ listing, className }: { listing: ParsedClassifiedListing; className?: string }) {
  const { event, title, summary, images, price, status, location, sourceUrl, hashtags } = listing;
  const components = useMemo(() => buildMarkdownComponents(event), [event]);

  // Description minus the lines that just repeat the title / summary / price
  // tags. Empty when the content is pure boilerplate — section is hidden.
  const description = useMemo(() => listingResidualContent(listing), [listing]);

  // Selected gallery image — tracked by URL so a changed event resets safely.
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const mainImage = selected && images.includes(selected) ? selected : images[0];

  const isSold = status === 'sold';
  const priceLabel = price ? formatListingPrice(price) : undefined;
  const host = sourceUrl ? displayHost(sourceUrl) : undefined;

  return (
    <div className={cn('mt-4', className)}>
      {/* Hero: gallery + buy box */}
      <div className={cn('grid gap-5', mainImage && 'sm:grid-cols-2 sm:gap-7')}>
        {/* Gallery */}
        {mainImage && (
          <div className="space-y-2.5 min-w-0">
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
              <img
                src={mainImage}
                alt={title}
                decoding="async"
                className={cn('absolute inset-0 size-full object-cover', isSold && 'opacity-60 grayscale')}
              />
              {isSold && (
                <span className="absolute left-4 top-4 rounded-full bg-foreground/90 px-3 py-1 text-xs font-bold uppercase tracking-widest text-background">
                  Sold
                </span>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1" role="listbox" aria-label="Listing photos">
                {images.map((url) => {
                  const active = url === mainImage;
                  return (
                    <button
                      key={url}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => setSelected(url)}
                      className={cn(
                        'relative size-16 shrink-0 overflow-hidden rounded-lg transition-all',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active ? 'ring-2 ring-primary' : 'opacity-60 hover:opacity-100',
                      )}
                    >
                      <img src={url} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Buy box */}
        <div className="flex min-w-0 flex-col gap-3 sm:py-1">
          <h1 dir="auto" className="text-2xl font-bold leading-tight break-words">
            {title}
          </h1>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {priceLabel && (
              <span className={cn('text-3xl font-extrabold tracking-tight', isSold ? 'text-muted-foreground line-through decoration-2' : 'text-primary')}>
                {priceLabel}
              </span>
            )}
            {isSold && (
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-secondary-foreground">
                Sold
              </span>
            )}
          </div>

          {summary && (
            <p dir="auto" className="text-[15px] leading-relaxed text-muted-foreground">
              {summary}
            </p>
          )}

          {/* Quiet meta line — the header already shows when it was listed */}
          {location && (
            <p className="flex items-center gap-1.5 min-w-0 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{location}</span>
            </p>
          )}

          {/* CTA */}
          {sourceUrl && !isSold && (
            <Button
              size="lg"
              className="mt-1 w-full rounded-xl text-base font-semibold sm:max-w-xs"
              onClick={(e) => {
                e.stopPropagation();
                openUrl(sourceUrl);
              }}
            >
              View on {host}
              <ExternalLink className="ml-2 size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      {/* Description — only when there's something beyond tag boilerplate */}
      {description && (
        <div className="mt-7 border-t border-border pt-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Description
          </h2>
          <div
            dir="auto"
            className="prose prose-sm max-w-none break-words text-foreground prose-headings:text-foreground prose-headings:font-bold prose-strong:text-foreground prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-img:rounded-lg prose-li:marker:text-muted-foreground prose-blockquote:text-muted-foreground prose-blockquote:border-border prose-hr:border-border"
          >
            <Markdown remarkPlugins={[retextSmartypants]} rehypePlugins={[rehypeSanitize]} components={components}>
              {description}
            </Markdown>
          </div>
        </div>
      )}

      {/* Category chips */}
      {hashtags.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {hashtags.map((tag) => (
            <a
              key={tag}
              href={`/t/${encodeURIComponent(tag)}`}
              className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              onClick={(e) => e.stopPropagation()}
            >
              #{tag}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Feed card ─────────────────────────────────────────────────

/**
 * Compact feed card, styled after {@link LightningInvoiceCard}'s horizontal
 * commerce layout — square product photo on the left, a "For Sale" pill row,
 * and one big price — so a listing reads as a *thing for sale* at a glance,
 * not as an article.
 */
function ListingFeedCard({ listing, className }: { listing: ParsedClassifiedListing; className?: string }) {
  const { title, images, price, status, location } = listing;
  const cover = images[0];
  const isSold = status === 'sold';
  const priceLabel = price ? formatListingPrice(price) : undefined;

  return (
    <div
      className={cn(
        'isolate my-2.5 relative rounded-2xl border border-border overflow-hidden @container',
        className,
      )}
    >
      {/* Subtle accent glow behind the photo area */}
      <div className="absolute -z-10 top-0 left-0 w-44 h-44 bg-primary/[0.06] rounded-full blur-2xl" />

      <div className="flex gap-1">
        {/* Product photo — square thumbnail, like the invoice QR */}
        {cover && (
          <div className="shrink-0 p-3">
            <div className="relative size-28 sm:size-40 overflow-hidden rounded-xl bg-muted">
              <img
                src={cover}
                alt={title}
                loading="lazy"
                decoding="async"
                className={cn('absolute inset-0 size-full object-cover', isSold && 'opacity-60 grayscale')}
              />
            </div>
          </div>
        )}

        {/* Info column */}
        <div className={cn('flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-3.5 pr-3.5', !cover && 'pl-3.5')}>
          {/* Label row */}
          <div
            className="flex items-center gap-1.5 whitespace-nowrap font-medium text-muted-foreground"
            style={{ fontSize: 'clamp(0.8rem, 3.5cqw, 1.05rem)' }}
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 sm:size-6">
              <Tag className="size-3 text-primary sm:size-3.5" />
            </span>
            {isSold ? 'Sold' : 'For Sale'}
          </div>

          {/* Price — the big number */}
          {priceLabel && (
            <div
              className={cn(
                'whitespace-nowrap font-bold leading-none tracking-tight',
                isSold && 'text-muted-foreground line-through decoration-2',
              )}
              style={{ fontSize: 'clamp(1.5rem, 8cqw, 2.25rem)' }}
            >
              {priceLabel}
            </div>
          )}

          {/* Title */}
          <p dir="auto" className="line-clamp-2 break-words text-sm font-medium leading-snug sm:text-base">
            {title}
          </p>

          {/* Location */}
          {location && (
            <p className="flex items-center gap-1 min-w-0 text-xs text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{location}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
