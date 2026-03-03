import { Download, FileIcon } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import { ImageGallery } from '@/components/ImageGallery';
import { VideoPlayer } from '@/components/VideoPlayer';
import { WebxdcEmbed } from '@/components/WebxdcEmbed';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { useAuthor } from '@/hooks/useAuthor';
import { getDisplayName } from '@/lib/getDisplayName';
import { genUserName } from '@/lib/genUserName';

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

/** YouTube-style description card rendered below media. */
function DescriptionCard({ text }: { text: string }) {
  return (
    <div className="mt-2.5 rounded-xl bg-secondary/50 px-3.5 py-2.5">
      <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

/** Inner component for audio events — needs author data for avatar. */
function AudioFileContent({
  event,
  url,
  mime,
  description,
}: {
  event: NostrEvent;
  url: string;
  mime: string;
  description: string | undefined;
}) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey) ?? genUserName(event.pubkey);

  return (
    <div className="mt-3">
      <AudioVisualizer
        src={url}
        mime={mime}
        avatarUrl={metadata?.picture}
        avatarFallback={displayName[0]?.toUpperCase() ?? '?'}
      />
      {description && <DescriptionCard text={description} />}
    </div>
  );
}

interface FileMetadataContentProps {
  event: NostrEvent;
  /** If true, render a more compact version for feed cards. */
  compact?: boolean;
}

/**
 * Renders the content of a NIP-94 (kind 1063) file metadata event.
 *
 * Media renders directly, and the description appears in a separate
 * rounded card below it (similar to YouTube's description box).
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
      <div className="mt-3">
        <WebxdcEmbed
          url={url}
          uuid={webxdcId}
          name={appName}
          icon={thumb}
        />
        {description && <DescriptionCard text={description} />}
      </div>
    );
  }

  // ── Image ───────────────────────────────────────────────────────────
  if (mime.startsWith('image/')) {
    const imetaMap = (dim || blurhash)
      ? new Map([[url, { dim, blurhash }]])
      : undefined;
    return (
      <div className="mt-3">
        <ImageGallery images={[url]} imetaMap={imetaMap} />
        {description && !compact && <DescriptionCard text={description} />}
      </div>
    );
  }

  // ── Video ───────────────────────────────────────────────────────────
  if (mime.startsWith('video/')) {
    return (
      <div className="mt-3">
        <VideoPlayer src={url} poster={thumb} dim={dim} blurhash={blurhash} title={altText} />
        {description && !compact && <DescriptionCard text={description} />}
      </div>
    );
  }

  // ── Audio ───────────────────────────────────────────────────────────
  if (mime.startsWith('audio/')) {
    return <AudioFileContent event={event} url={url} mime={mime} description={description} />;
  }

  // ── Fallback: generic file ──────────────────────────────────────────
  const displayName = altText ?? fileName;
  const mimeLabel = mime ? mime.split('/').pop()?.toUpperCase() : undefined;

  return (
    <div className="mt-3">
      <div className="rounded-2xl border border-border overflow-hidden">
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
      </div>
      {description && <DescriptionCard text={description} />}
    </div>
  );
}
