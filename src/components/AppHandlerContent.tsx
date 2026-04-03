import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { ExternalLink, GitFork, Package, Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { NsitePreviewDialog } from '@/components/NsitePreviewDialog';
import { Skeleton } from '@/components/ui/skeleton';
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

/** Encode a 32-byte hex pubkey as a base36 string (50 chars, zero-padded). */
function hexToBase36(hex: string): string {
  let n = 0n;
  for (let i = 0; i < hex.length; i++) {
    n = n * 16n + BigInt(parseInt(hex[i], 16));
  }
  return n.toString(36).padStart(50, '0');
}

interface NsiteRef {
  /** The nsite.lol gateway URL used for proxying (e.g. https://<b36><dtag>.nsite.lol). */
  gatewayUrl: string;
  /** The bare nsite name shown in the address bar (e.g. "<b36><dtag>"). */
  name: string;
}

/**
 * Extract nsite info from a kind 35128 `a` tag, if present.
 * The `a` tag value format is `"35128:<pubkey>:<d-tag>"`.
 */
function getNsiteRef(tags: string[][]): NsiteRef | undefined {
  for (const tag of tags) {
    if (tag[0] !== 'a') continue;
    const parts = tag[1]?.split(':');
    if (!parts || parts[0] !== '35128' || parts.length < 3) continue;
    const pubkey = parts[1];
    const dTag = parts.slice(2).join(':');
    if (!pubkey || !dTag) continue;
    const name = `${hexToBase36(pubkey)}${dTag}`;
    return { gatewayUrl: `https://${name}.nsite.lol`, name };
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
  const banner = metadata.banner;
  const websiteUrl = getWebsiteUrl(event.tags, metadata);
  const hashtags = getAllTags(event.tags, 't');

  const shakespeareUrl = useMemo(() => getShakespeareUrl(event.tags), [event.tags]);
  const nsiteRef = useMemo(() => getNsiteRef(event.tags), [event.tags]);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (compact) {
    return (
      <>
      <div className="mt-2">
        <div className="rounded-xl border border-border overflow-hidden transition-all duration-300 hover:shadow-md hover:border-primary/20">
          {/* Banner hero */}
          {banner && (
            <div className="relative aspect-[2/1] bg-gradient-to-br from-muted/50 to-muted overflow-hidden">
              <img
                src={banner}
                alt=""
                className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
            </div>
          )}

          {/* Content */}
          <div className="relative px-3.5 pb-3.5 space-y-2">
            {/* App icon — overlaps the banner hero like a profile avatar */}
            <div className={banner ? '-mt-7' : 'pt-3.5'}>
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

            {/* Tags */}
            {hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
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

            {/* Actions */}
            <div className="flex items-center gap-2">
              {nsiteRef && (
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={(e) => { e.stopPropagation(); setPreviewOpen(true); }}
                >
                  <Play className="size-3 mr-1" />
                  Run
                </Button>
              )}
              {websiteUrl && (
                <Button asChild size="sm" variant={nsiteRef ? 'secondary' : 'default'} className="h-7 text-xs">
                  <a href={websiteUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                    Open App
                    <ExternalLink className="size-3 ml-1.5" />
                  </a>
                </Button>
              )}
              {shakespeareUrl && (
                <Button asChild variant="secondary" size="sm" className="h-7 text-xs">
                  <a href={shakespeareUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                    Fork
                    <GitFork className="size-3 ml-1" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {nsiteRef && (
         <NsitePreviewDialog
           nsiteUrl={nsiteRef.gatewayUrl}
           appName={name}
           appPicture={picture}
           open={previewOpen}
           onOpenChange={setPreviewOpen}
         />
       )}
       </>
     );
  }

  // Full detail view
  return (
    <div className="mt-3">
      <div className="rounded-xl border border-border overflow-hidden">
        {/* Banner hero */}
        {banner && (
          <div className="relative aspect-[2/1] bg-gradient-to-br from-muted/50 to-muted overflow-hidden">
            <img
              src={banner}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* Content */}
        <div className="relative px-4 pb-4 space-y-3">
          {/* App icon — overlaps the banner hero like a profile avatar */}
          <div className={cn(
            'flex items-end justify-between',
            banner ? '-mt-10' : 'pt-4',
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

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {nsiteRef && (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); setPreviewOpen(true); }}
              >
                <Play className="size-3.5 mr-1.5" />
                Run
              </Button>
            )}
            {websiteUrl && (
              <Button asChild size="sm" variant={nsiteRef ? 'secondary' : 'default'}>
                <a href={websiteUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  Open App
                  <ExternalLink className="size-3 ml-1.5" />
                </a>
              </Button>
            )}
            {shakespeareUrl && (
              <Button asChild variant="secondary" size="sm">
                <a href={shakespeareUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  Fork
                  <GitFork className="size-3.5 ml-1.5" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      {nsiteRef && (
        <NsitePreviewDialog
          nsiteUrl={nsiteRef.gatewayUrl}
          appName={name}
          appPicture={picture}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      )}
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
