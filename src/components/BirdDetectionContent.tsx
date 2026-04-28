import { useMemo } from 'react';
import { Bird, ExternalLink, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';

import { Skeleton } from '@/components/ui/skeleton';
import { useWikidataEntity } from '@/hooks/useWikidataEntity';
import { useWikipediaSummary } from '@/hooks/useWikipediaSummary';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

/**
 * Birdstar kind 2473 — Bird Detection.
 *
 * The species is identified by a NIP-73 `i`/`k` pair pointing at a Wikidata
 * entity URI (e.g. `https://www.wikidata.org/entity/Q26825`). We resolve it
 * through Wikidata → English Wikipedia to get a display name, a short
 * summary, and a thumbnail image.
 *
 * Structured data lives in tags; `content` is an optional freeform note.
 */

const WIKIDATA_URL_RE = /^https:\/\/www\.wikidata\.org\/entity\/(Q\d+)$/;

interface BirdDetectionContentProps {
  event: NostrEvent;
  className?: string;
}

function extractWikidata(tags: string[][]): { id: string; url: string } | null {
  // A valid detection pairs an `i` tag with `k: web`. There may be multiple
  // i/k pairs in principle; we take the first `i` whose URL matches.
  for (const tag of tags) {
    if (tag[0] !== 'i') continue;
    const value = tag[1];
    if (typeof value !== 'string') continue;
    const m = value.match(WIKIDATA_URL_RE);
    if (m) return { id: m[1], url: value };
  }
  return null;
}

/** Pull a species label from the `alt` tag: "Bird detection: American Robin (Turdus migratorius)". */
function extractAltSpecies(tags: string[][]): { common?: string; scientific?: string } | null {
  const alt = tags.find(([n]) => n === 'alt')?.[1];
  if (!alt) return null;
  // Match "Bird detection: <Common> (<Scientific>)" — keep the parser loose
  // so subtly different NIP-31 prefixes still yield a usable label.
  const m = alt.match(/^[^:]*:\s*([^()]+?)\s*(?:\(([^)]+)\))?\s*$/);
  if (!m) return { common: alt };
  return { common: m[1]?.trim(), scientific: m[2]?.trim() };
}

export function BirdDetectionContent({ event, className }: BirdDetectionContentProps) {
  const wikidata = useMemo(() => extractWikidata(event.tags), [event.tags]);
  const altSpecies = useMemo(() => extractAltSpecies(event.tags), [event.tags]);
  const note = event.content.trim();

  // Resolve Wikidata → English Wikipedia title, then fetch the Wikipedia
  // summary (extract + thumbnail) for the title.
  const { data: entity, isLoading: entityLoading } = useWikidataEntity(wikidata?.id ?? null);
  const wikipediaTitle = entity?.wikipediaTitle ?? null;
  const { data: summary, isLoading: summaryLoading } = useWikipediaSummary(wikipediaTitle);

  const isLoading = entityLoading || summaryLoading;

  // Prefer the Wikipedia page title for the display name when available,
  // but fall back to the species parsed from the `alt` tag so the card is
  // still meaningful while the Wikipedia fetch is in flight (or has failed).
  const commonName = summary?.title ?? altSpecies?.common ?? 'Unknown species';
  const scientificName = altSpecies?.scientific;
  const extract = summary?.extract;
  const thumbnail = sanitizeUrl(summary?.thumbnail?.source);
  const articleUrl = sanitizeUrl(summary?.articleUrl);

  // "Discuss" routes the user to Ditto's external-content page for this
  // species' Wikidata URL. Other users' kind 2473 detections and NIP-22
  // comments both attach to the same `i`-tag identifier, so the discussion
  // thread aggregates naturally across clients.
  const discussPath = wikidata ? `/i/${encodeURIComponent(wikidata.url)}` : undefined;

  // When the user's own freeform note exists we show it above the
  // Wikipedia-derived summary. `content` can be empty per the NIP.
  const timeStr = new Date(event.created_at * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (!wikidata) {
    // Shouldn't happen for a valid kind 2473 (the NIP requires the i tag),
    // but render something useful rather than silently dropping the event.
    return (
      <div className={cn('mt-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground', className)}>
        Bird detection with no species reference.
      </div>
    );
  }

  return (
    <div className={cn('mt-2', className)}>
      <div className="flex overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
        {/* Thumbnail panel */}
        <div className="relative w-32 shrink-0 bg-gradient-to-br from-emerald-100 via-sky-100 to-amber-100 sm:w-40 dark:from-indigo-950 dark:via-indigo-900 dark:to-amber-900/40">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : thumbnail ? (
            <img
              src={thumbnail}
              alt={commonName}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Bird
                aria-hidden
                strokeWidth={1.5}
                className="size-10 text-emerald-700/60 dark:text-amber-300/60"
              />
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-1.5 left-2 font-mono text-[10px] uppercase tracking-wider text-white/85">
            {timeStr}
          </div>
        </div>

        {/* Text panel */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5">
          <div className="min-w-0">
            <div className="flex items-start gap-1.5">
              <Bird aria-hidden className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-amber-300" />
              <h3 className="truncate text-[15px] font-semibold leading-tight">
                {commonName}
              </h3>
            </div>
            {scientificName && (
              <p className="mt-0.5 truncate pl-5 text-xs italic text-muted-foreground">
                {scientificName}
              </p>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-1.5 pt-0.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ) : extract ? (
            <p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
              {extract}
            </p>
          ) : (
            <p className="text-xs italic text-muted-foreground/70">
              Heard at {new Date(event.created_at * 1000).toLocaleString()}.
            </p>
          )}

          {(articleUrl || discussPath) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
              {discussPath && (
                <Link
                  to={discussPath}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  <MessageCircle className="size-3" />
                  Discuss
                </Link>
              )}
              {articleUrl && (
                <a
                  href={articleUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-3" />
                  Wikipedia
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {note && (
        <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
          {note}
        </p>
      )}
    </div>
  );
}
