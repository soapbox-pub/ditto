import { Download, FileIcon, Music } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import { ImageGallery } from '@/components/ImageGallery';
import { VideoPlayer } from '@/components/VideoPlayer';
import { WebxdcEmbed } from '@/components/WebxdcEmbed';

/** Extract the first value of a tag by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Format bytes into a human-readable string. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileMetadataContentProps {
  event: NostrEvent;
  /** If true, render a more compact version for feed cards. */
  compact?: boolean;
}

/**
 * Renders the content of a NIP-94 (kind 1063) file metadata event.
 *
 * Each MIME type is wrapped in a cohesive card with the media as the
 * hero element and the description as a footer section below.
 */
export function FileMetadataContent({ event, compact }: FileMetadataContentProps) {
  const url = getTag(event.tags, 'url');
  const mime = getTag(event.tags, 'm') ?? '';
  const alt = getTag(event.tags, 'alt');
  const webxdcId = getTag(event.tags, 'webxdc');
  const dim = getTag(event.tags, 'dim');
  const blurhash = getTag(event.tags, 'blurhash');
  const thumb = getTag(event.tags, 'thumb') ?? getTag(event.tags, 'image');
  const summary = getTag(event.tags, 'summary');
  const size = getTag(event.tags, 'size');

  if (!url) return null;

  const description = event.content || undefined;
  const altText = alt ?? undefined;
  const fileName = url.split('/').pop() ?? 'file';
  const sizeStr = size ? formatBytes(Number(size)) : undefined;

  // ── Webxdc app ──────────────────────────────────────────────────────
  if (mime === 'application/x-webxdc') {
    const appName = altText?.replace(/^Webxdc app:\s*/i, '') ?? summary ?? fileName.replace('.xdc', '');
    return (
      <div className="mt-3 rounded-2xl border border-border overflow-hidden">
        <div className="p-3 pb-0">
          <WebxdcEmbed
            url={url}
            uuid={webxdcId}
            name={appName}
            icon={thumb}
            className="!mt-0 !border-0 !rounded-xl"
          />
        </div>
        {description && (
          <div className="px-4 py-3">
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
        )}
        {!description && <div className="h-3" />}
      </div>
    );
  }

  // ── Image ───────────────────────────────────────────────────────────
  if (mime.startsWith('image/')) {
    const imetaMap = (dim || blurhash)
      ? new Map([[url, { dim, blurhash }]])
      : undefined;

    // No description → just render the image directly, no card wrapper
    if (!description || compact) {
      return (
        <div className="mt-3">
          <ImageGallery images={[url]} imetaMap={imetaMap} />
        </div>
      );
    }

    return (
      <div className="mt-3 rounded-2xl border border-border overflow-hidden">
        <ImageGallery images={[url]} imetaMap={imetaMap} />
        <div className="px-4 py-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
    );
  }

  // ── Video ───────────────────────────────────────────────────────────
  if (mime.startsWith('video/')) {
    if (!description || compact) {
      return (
        <div className="mt-3">
          <VideoPlayer src={url} poster={thumb} dim={dim} blurhash={blurhash} />
        </div>
      );
    }

    return (
      <div className="mt-3 rounded-2xl border border-border overflow-hidden">
        <VideoPlayer src={url} poster={thumb} dim={dim} blurhash={blurhash} />
        <div className="px-4 py-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
    );
  }

  // ── Audio ───────────────────────────────────────────────────────────
  if (mime.startsWith('audio/')) {
    const trackName = altText ?? fileName;
    return (
      <div className="mt-3 rounded-2xl border border-border overflow-hidden">
        <div className="flex items-center gap-3 p-4 pb-3">
          <div className="flex items-center justify-center size-12 rounded-xl bg-primary/10 shrink-0">
            <Music className="size-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{trackName}</p>
            {sizeStr && (
              <p className="text-xs text-muted-foreground mt-0.5">{sizeStr}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground hover:text-foreground" asChild>
            <a href={url} download title="Download">
              <Download className="size-4" />
            </a>
          </Button>
        </div>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <div className="px-4 pb-4">
          <audio controls preload="metadata" className="w-full">
            <source src={url} type={mime} />
          </audio>
        </div>
        {description && (
          <div className="px-4 pb-4 -mt-1 border-t border-border pt-3">
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Fallback: generic file ──────────────────────────────────────────
  const displayName = altText ?? fileName;
  const mimeLabel = mime ? mime.split('/').pop()?.toUpperCase() : undefined;

  return (
    <div className="mt-3 rounded-2xl border border-border overflow-hidden">
      <div className="flex items-center gap-3.5 p-4">
        <div className="flex items-center justify-center size-12 rounded-xl bg-muted shrink-0">
          <FileIcon className="size-6 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{displayName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {[mimeLabel, sizeStr].filter(Boolean).join(' · ') || 'File'}
          </p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 rounded-full gap-1.5" asChild>
          <a href={url} download>
            <Download className="size-3.5" />
            Download
          </a>
        </Button>
      </div>
      {description && (
        <div className="px-4 pb-4 border-t border-border pt-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      )}
    </div>
  );
}
