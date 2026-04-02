import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { ExternalLink, Package } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { Skeleton } from '@/components/ui/skeleton';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { NostrURI } from '@/lib/NostrURI';
import { cn } from '@/lib/utils';

/** Get a tag value by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Get all values for a tag name. */
function getAllTags(tags: string[][], name: string): string[] {
  return tags.filter(([n]) => n === name).map(([, v]) => v);
}

/** Parse kind-0-style metadata from the content field. */
function parseHandlerMetadata(content: string): NostrMetadata {
  if (!content) return {};
  try {
    return JSON.parse(content) as NostrMetadata;
  } catch {
    return {};
  }
}

/** Get the website URL from web handler tags or metadata. */
function getWebsiteUrl(tags: string[][], metadata: NostrMetadata): string | undefined {
  const webTags = tags.filter(([n]) => n === 'web');
  for (const tag of webTags) {
    const url = tag[1];
    if (url) {
      const base = url.replace(/<bech32>/g, '').replace(/\/+$/, '');
      return base;
    }
  }
  return metadata.website;
}

/** Extract the display domain from a URL. */
function displayDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Build a Shakespeare "Edit with Shakespeare" URL from a kind 30617 `a` tag, if present. */
function getShakespeareUrl(tags: string[][]): string | undefined {
  for (const tag of tags) {
    if (tag[0] !== 'a') continue;
    const parts = tag[1]?.split(':');
    if (!parts || parts[0] !== '30617' || parts.length < 3) continue;
    const pubkey = parts[1];
    const identifier = parts.slice(2).join(':');
    const nostrUri = new NostrURI({ pubkey, identifier }).toString();
    return `https://shakespeare.diy/clone?url=${encodeURIComponent(nostrUri)}`;
  }
  return undefined;
}

interface AppHandlerContentProps {
  event: NostrEvent;
  /** If true, show compact preview (used in NoteCard feed). */
  compact?: boolean;
}

/** Renders a kind 31990 NIP-89 application handler event as a showcase-style card. */
export function AppHandlerContent({ event, compact }: AppHandlerContentProps) {
  const metadata = useMemo(() => parseHandlerMetadata(event.content), [event.content]);

  const name = metadata.name || getTag(event.tags, 'name') || getTag(event.tags, 'd') || 'Unknown App';
  const about = metadata.about;
  const picture = metadata.picture;
  const websiteUrl = getWebsiteUrl(event.tags, metadata);
  const hashtags = getAllTags(event.tags, 't');

  const shakespeareUrl = useMemo(() => getShakespeareUrl(event.tags), [event.tags]);

  const { data: preview, isLoading: previewLoading } = useLinkPreview(websiteUrl ?? null);
  const thumbnailUrl = preview?.thumbnail_url;

  const [imgError, setImgError] = useState(false);
  const showThumbnail = thumbnailUrl && !imgError;

  if (compact) {
    return (
      <div className="mt-2">
        <div className="rounded-xl border border-border overflow-hidden transition-all duration-300 hover:shadow-md hover:border-primary/20">
          {/* Screenshot hero — only shown while loading or when a thumbnail exists */}
          {(previewLoading || showThumbnail) && (
            <div className="relative aspect-[2/1] bg-gradient-to-br from-muted/50 to-muted overflow-hidden">
              {previewLoading ? (
                <Skeleton className="absolute inset-0" />
              ) : (
                <img
                  src={thumbnailUrl}
                  alt={name}
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                  onError={() => setImgError(true)}
                />
              )}
            </div>
          )}

          {/* Content */}
          <div className="relative z-10 px-3.5 pb-3.5 space-y-2">
            {/* App icon — overlaps the screenshot hero like a profile avatar */}
            <div className={showThumbnail || previewLoading ? '-mt-7' : 'pt-3.5'}>
              {picture ? (
                <img
                  src={picture}
                  alt={name}
                  className="size-14 rounded-xl object-cover shrink-0 border-3 border-background bg-background shadow-sm"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="size-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border-3 border-background shadow-sm">
                  <Package className="size-6 text-primary/50" />
                </div>
              )}
            </div>

            {/* Name + domain */}
            <div className="min-w-0">
              <h3 className="font-semibold text-[15px] leading-snug truncate">{name}</h3>
              {websiteUrl && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                  <ExternalFavicon url={websiteUrl} size={12} />
                  <span className="truncate">{displayDomain(websiteUrl)}</span>
                </div>
              )}
            </div>

            {/* Description */}
            {about && (
              <p className="text-sm text-muted-foreground line-clamp-2">{about}</p>
            )}

            {/* Tags + actions */}
            <div className="flex items-center gap-2">
              {hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                  {hashtags.slice(0, 4).map((tag) => (
                    <Link
                      key={tag}
                      to={`/t/${encodeURIComponent(tag)}`}
                      className="text-xs text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      #{tag}
                    </Link>
                  ))}
                </div>
              )}
              {shakespeareUrl && (
                <a
                  href={shakespeareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <img
                    src="https://shakespeare.diy/badge.svg"
                    alt="Edit with Shakespeare"
                    className="h-5 hover:opacity-80 transition-opacity"
                  />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Full detail view
  return (
    <div className="mt-3">
      <div className="rounded-xl border border-border overflow-hidden">
        {/* Screenshot hero — only shown while loading or when a thumbnail exists */}
        {(previewLoading || showThumbnail) && (
          <div className="relative aspect-[2/1] bg-gradient-to-br from-muted/50 to-muted overflow-hidden">
            {previewLoading ? (
              <Skeleton className="absolute inset-0" />
            ) : (
              <img
                src={thumbnailUrl}
                alt={name}
                className="size-full object-cover"
                loading="lazy"
                onError={() => setImgError(true)}
              />
            )}
          </div>
        )}

        {/* Content */}
        <div className="relative z-10 px-4 pb-4 space-y-3">
          {/* App icon — overlaps the screenshot hero like a profile avatar */}
          <div className={cn(
            'flex items-end justify-between',
            showThumbnail || previewLoading ? '-mt-10' : 'pt-4',
          )}>
            {picture ? (
              <img
                src={picture}
                alt={name}
                className="size-20 rounded-2xl object-cover shrink-0 border-4 border-background bg-background shadow-sm"
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="size-20 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border-4 border-background shadow-sm">
                <Package className="size-8 text-primary/50" />
              </div>
            )}
          </div>

          {/* Name + domain */}
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-snug truncate">{name}</h2>
            {websiteUrl && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <ExternalFavicon url={websiteUrl} size={14} />
                <span className="truncate">{displayDomain(websiteUrl)}</span>
              </div>
            )}
          </div>

          {/* Description */}
          {about && (
            <p className="text-sm text-muted-foreground leading-relaxed">{about}</p>
          )}

          {/* Tags */}
          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {hashtags.map((tag) => (
                <Link
                  key={tag}
                  to={`/t/${encodeURIComponent(tag)}`}
                  className="text-xs text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}

          {/* Edit with Shakespeare */}
          {shakespeareUrl && (
            <a
              href={shakespeareUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src="https://shakespeare.diy/badge.svg"
                alt="Edit with Shakespeare"
                className="h-6 hover:opacity-80 transition-opacity"
              />
            </a>
          )}

          {/* Actions */}
          {websiteUrl && (
            <div className="pt-1">
              <Button asChild size="sm" onClick={(e) => e.stopPropagation()}>
                <a href={websiteUrl} target="_blank" rel="noopener noreferrer">
                  Open App
                  <ExternalLink className="size-3 ml-1.5" />
                </a>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Skeleton loading state for AppHandlerContent. */
export function AppHandlerSkeleton() {
  return (
    <div className="mt-3">
      <div className="rounded-xl border border-border overflow-hidden">
        <Skeleton className="aspect-[2/1] w-full" />
        <div className="px-4 pb-4 space-y-3">
          <div className="-mt-10">
            <Skeleton className="size-20 rounded-2xl border-4 border-background" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      </div>
    </div>
  );
}
