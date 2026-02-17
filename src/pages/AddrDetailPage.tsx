import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useSeoMeta } from '@unhead/react';

import { MainLayout } from '@/components/MainLayout';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddrEvent, type AddrCoords } from '@/hooks/useEvent';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';
import NotFound from './NotFound';
import type { NostrEvent } from '@nostrify/nostrify';

interface AddrDetailPageProps {
  addr: AddrCoords;
}

/** Formats a timestamp into a full date string. */
function formatFullDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Extract metadata from an addressable event's tags and content. */
function extractMetadata(event: NostrEvent): {
  title?: string;
  description?: string;
  image?: string;
  images: string[];
  tags: string[];
  extra: Record<string, string>;
} {
  const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1];

  let title = getTag('title') || getTag('name');
  let description = getTag('summary') || getTag('description');
  let image = getTag('image') || getTag('thumb') || getTag('banner');
  let images: string[] = [];
  const tags = event.tags.filter(([n]) => n === 't').map(([, v]) => v);
  const extra: Record<string, string> = {};

  // Try parsing JSON content for additional metadata
  if (event.content) {
    try {
      const parsed = JSON.parse(event.content);
      if (typeof parsed === 'object' && parsed !== null) {
        if (!title && parsed.title) title = parsed.title;
        if (!description && parsed.description) description = parsed.description;
        if (parsed.images && Array.isArray(parsed.images)) images = parsed.images;
        if (!image && images.length > 0) image = images[0];
        if (!image && parsed.image) image = parsed.image;

        // Collect extra fields for display
        for (const [key, value] of Object.entries(parsed)) {
          if (['title', 'description', 'images', 'image'].includes(key)) continue;
          if (typeof value === 'string' && value.trim()) {
            extra[key] = value;
          }
        }
      }
    } catch {
      // Content is not JSON — use as description
      if (!description && event.content.length > 0) {
        description = event.content;
      }
    }
  }

  return { title, description, image, images, tags, extra };
}

export function AddrDetailPage({ addr }: AddrDetailPageProps) {
  const { data: event, isLoading, isError } = useAddrEvent(addr);

  useSeoMeta({
    title: event
      ? `${event.tags.find(([n]) => n === 'title')?.[1] || 'Event'} - Mew`
      : 'Loading... - Mew',
  });

  if (isLoading) {
    return (
      <MainLayout>
        <AddrDetailShell>
          <AddrDetailSkeleton />
        </AddrDetailShell>
      </MainLayout>
    );
  }

  if (isError || !event) {
    return <NotFound />;
  }

  return (
    <MainLayout>
      <AddrDetailShell>
        <AddrDetailContent event={event} />
      </AddrDetailShell>
    </MainLayout>
  );
}

function AddrDetailShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  return (
    <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
      <div className="sticky top-10 sidebar:top-0 z-10 flex items-center gap-4 px-4 h-[53px] bg-background/80 backdrop-blur-md">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 -ml-1.5 rounded-full hover:bg-secondary/60 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-xl font-bold">Details</h1>
      </div>
      {children}
    </main>
  );
}

function AddrDetailContent({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(event.pubkey);
  const nip05 = metadata?.nip05;
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);

  const { title, description, image, images, tags, extra } = useMemo(
    () => extractMetadata(event),
    [event],
  );

  // All images (excluding the hero if already shown)
  const galleryImages = images.length > 1 ? images.slice(1) : [];

  return (
    <div>
      {/* Hero image */}
      {image && (
        <div className="w-full overflow-hidden bg-muted border-b border-border">
          <img
            src={image}
            alt={title || ''}
            className="w-full h-auto max-h-[400px] object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      <article className="px-4 pt-4 pb-4">
        {/* Author row */}
        <div className="flex items-center gap-3">
          <Link to={`/${npub}`}>
            <Avatar className="size-11">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-sm">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>

          <div className="flex-1 min-w-0">
            <Link to={`/${npub}`} className="font-bold text-[15px] hover:underline block truncate">
              {displayName}
            </Link>
            {nip05 && (
              <span className="text-sm text-muted-foreground truncate block">
                @{nip05}
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        {title && (
          <h2 className="text-xl font-bold mt-4 leading-snug">
            {title}
          </h2>
        )}

        {/* Description */}
        {description && (
          <p className="text-[15px] text-muted-foreground leading-relaxed mt-2 whitespace-pre-wrap">
            {description}
          </p>
        )}

        {/* Gallery */}
        {galleryImages.length > 0 && (
          <div className={cn(
            'mt-4 rounded-2xl overflow-hidden border border-border',
            galleryImages.length > 1 && 'grid grid-cols-2 gap-0.5',
          )}>
            {galleryImages.slice(0, 4).map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={url}
                  alt=""
                  className="w-full h-auto max-h-[300px] object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        )}

        {/* Extra metadata fields */}
        {Object.keys(extra).length > 0 && (
          <div className="mt-4 space-y-1.5">
            {Object.entries(extra).map(([key, value]) => {
              // Skip empty values and URLs that are just certificate links etc.
              const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
              const isUrl = value.startsWith('http://') || value.startsWith('https://');

              return (
                <div key={key} className="flex items-baseline gap-2 text-sm">
                  <span className="text-muted-foreground shrink-0">{label}:</span>
                  {isUrl ? (
                    <a
                      href={value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline truncate inline-flex items-center gap-1"
                    >
                      {value}
                      <ExternalLink className="size-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-foreground">{value}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {tags.map((tag) => (
              <Link
                key={tag}
                to={`/t/${encodeURIComponent(tag)}`}
                className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full hover:bg-primary/20 transition-colors"
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}

        {/* Date */}
        <div className="pt-3 mt-3 border-t border-border text-sm text-muted-foreground">
          {formatFullDate(event.created_at)}
        </div>
      </article>
    </div>
  );
}

function AddrDetailSkeleton() {
  return (
    <div>
      <Skeleton className="w-full h-[200px] rounded-none" />
      <div className="px-4 pt-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
        <Skeleton className="h-6 w-3/4 mt-4" />
        <div className="mt-3 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
        <div className="flex gap-2 mt-4">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
        <Skeleton className="h-4 w-40 mt-4" />
      </div>
    </div>
  );
}
