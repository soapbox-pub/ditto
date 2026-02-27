import { Download, FileIcon } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import { ImageGallery } from '@/components/ImageGallery';
import { VideoPlayer } from '@/components/VideoPlayer';
import { WebxdcEmbed } from '@/components/WebxdcEmbed';

/** Extract the first value of a tag by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

interface FileMetadataContentProps {
  event: NostrEvent;
  /** If true, render a more compact version for feed cards. */
  compact?: boolean;
}

/**
 * Renders the content of a NIP-94 (kind 1063) file metadata event.
 *
 * Dispatches based on the `m` (MIME type) tag:
 * - `application/x-webxdc` → WebxdcEmbed
 * - `image/*` → ImageGallery
 * - `video/*` → VideoPlayer
 * - `audio/*` → native <audio> player
 * - fallback → download link
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

  if (!url) return null;

  const description = event.content || alt;
  const fileName = url.split('/').pop() ?? 'file';

  // Webxdc app
  if (mime === 'application/x-webxdc') {
    const appName = alt?.replace(/^Webxdc app:\s*/i, '') ?? summary ?? fileName.replace('.xdc', '');
    return (
      <div className="mt-2 space-y-2">
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        <WebxdcEmbed
          url={url}
          uuid={webxdcId}
          name={appName}
          icon={thumb}
        />
      </div>
    );
  }

  // Image
  if (mime.startsWith('image/')) {
    const imetaMap = (dim || blurhash)
      ? new Map([[url, { dim, blurhash }]])
      : undefined;
    return (
      <div className="mt-2 space-y-2">
        {description && !compact && (
          <p className="text-sm">{description}</p>
        )}
        <ImageGallery
          images={[url]}
          imetaMap={imetaMap}
        />
      </div>
    );
  }

  // Video
  if (mime.startsWith('video/')) {
    return (
      <div className="mt-2 space-y-2">
        {description && !compact && (
          <p className="text-sm">{description}</p>
        )}
        <VideoPlayer src={url} poster={thumb} dim={dim} blurhash={blurhash} />
      </div>
    );
  }

  // Audio
  if (mime.startsWith('audio/')) {
    return (
      <div className="mt-2 space-y-2">
        {description && (
          <p className="text-sm">{description}</p>
        )}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls preload="metadata" className="w-full rounded-xl">
          <source src={url} type={mime} />
        </audio>
      </div>
    );
  }

  // Fallback: generic file download
  return (
    <div className="mt-2 space-y-2">
      {description && (
        <p className="text-sm">{description}</p>
      )}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30">
        <FileIcon className="size-8 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{alt ?? fileName}</p>
          <p className="text-xs text-muted-foreground">{mime || 'Unknown type'}</p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" asChild>
          <a href={url} download>
            <Download className="size-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}
