import { useState } from 'react';
import { Download, FileIcon, Loader2 } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { NostrEvent } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import { ImageGallery } from '@/components/ImageGallery';
import { VideoPlayer } from '@/components/VideoPlayer';
import { WebxdcEmbed } from '@/components/WebxdcEmbed';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { useAuthor } from '@/hooks/useAuthor';
import { useToast } from '@/hooks/useToast';
import { parseFileEncryption, type FileEncryption } from '@/lib/encryptedFile';
import { downloadDecryptedUrl } from '@/lib/downloadFile';
import { getDisplayName } from '@/lib/getDisplayName';
import { getAvatarShape } from '@/lib/avatarShape';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

/** Extract the first value of a tag by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Extract every value of a repeatable tag. */
function getTags(tags: string[][], name: string): string[] {
  return tags.filter(([n, v]) => n === name && v).map(([, v]) => v);
}

/** Format bytes into a human-readable string. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** YouTube-style description card rendered below media. */
function DescriptionCard({ title, text }: { title?: string; text?: string }) {
  if (!title && !text) return null;
  return (
    <div className="mt-2.5 rounded-xl bg-secondary/50 px-3.5 py-2.5">
      {title && (
        <p className="text-base font-semibold text-foreground break-words">{title}</p>
      )}
      {text && (
        <p className={cn('text-sm leading-relaxed text-muted-foreground break-words', title && 'mt-1')}>
          {text}
        </p>
      )}
    </div>
  );
}

/** Inner component for audio events — needs author data for avatar. */
function AudioFileContent({
  event,
  url,
  mime,
  encryption,
  description,
}: {
  event: NostrEvent;
  url: string;
  mime: string;
  encryption?: FileEncryption;
  description: string | undefined;
}) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey) ?? 'Anonymous';

  return (
    <div className="mt-3">
      <AudioVisualizer
        src={url}
        mime={mime}
        encryption={encryption}
        avatarUrl={metadata?.picture}
        avatarFallback={displayName[0]?.toUpperCase() ?? '?'}
        avatarShape={getAvatarShape(metadata)}
      />
      {description && <DescriptionCard text={description} />}
    </div>
  );
}

/**
 * Download button for an encrypted attachment. The bytes on the server are
 * ciphertext, so they're fetched and decrypted here rather than linked to.
 */
function DecryptDownloadButton({ url, encryption, filename }: {
  url: string;
  encryption: FileEncryption;
  filename: string;
}) {
  const { toast } = useToast();
  const intl = useIntl();
  const [downloading, setDownloading] = useState(false);

  const onClick = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadDecryptedUrl(url, encryption, filename);
    } catch {
      toast({
        title: intl.formatMessage({ id: 'fileMetadata.downloadFailed', defaultMessage: 'Download failed' }),
        description: intl.formatMessage({
          id: 'fileMetadata.decryptFailed',
          defaultMessage: "This file couldn't be decrypted. Please try again.",
        }),
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0 rounded-full gap-1.5"
      onClick={onClick}
      disabled={downloading}
    >
      {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
      <FormattedMessage id="fileMetadata.download" defaultMessage="Download" />
    </Button>
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
  const url = sanitizeUrl(getTag(event.tags, 'url'));
  const mime = getTag(event.tags, 'm') ?? '';
  const alt = getTag(event.tags, 'alt');
  const webxdcId = getTag(event.tags, 'webxdc');
  const dim = getTag(event.tags, 'dim');
  const blurhash = getTag(event.tags, 'blurhash');
  const thumb = getTag(event.tags, 'thumb') ?? getTag(event.tags, 'image');
  const summary = getTag(event.tags, 'summary');
  const size = getTag(event.tags, 'size');

  // When the file is encrypted, `url` serves ciphertext, `m` describes the
  // plaintext, and `ox` is the plaintext hash we verify after decrypting.
  const encryption = parseFileEncryption({
    algorithm: getTag(event.tags, 'encryption-algorithm'),
    key: getTag(event.tags, 'decryption-key'),
    nonce: getTag(event.tags, 'decryption-nonce'),
    hash: getTag(event.tags, 'ox'),
    mime: getTag(event.tags, 'm'),
    fallbacks: getTags(event.tags, 'fallback'),
  });

  // Every branch below hands `encryption` to a component that decrypts for
  // itself — ImageGallery per tile, VideoPlayer / AudioVisualizer / WebxdcEmbed
  // per source. Decrypting here as well would fetch the same blob twice.
  const isImage = mime.startsWith('image/');

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
          icon={thumb}
          encryption={encryption}
          showNameCard={false}
        />
        <DescriptionCard title={appName} text={description} />
      </div>
    );
  }

  // ── Image ───────────────────────────────────────────────────────────
  if (isImage) {
    const imetaMap = (dim || blurhash || encryption)
      ? new Map([[url, { dim, blurhash, encryption }]])
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
        <VideoPlayer src={url} poster={thumb} encryption={encryption} dim={dim} blurhash={blurhash} title={altText} />
        {description && !compact && <DescriptionCard text={description} />}
      </div>
    );
  }

  // ── Audio ───────────────────────────────────────────────────────────
  if (mime.startsWith('audio/')) {
    return <AudioFileContent event={event} url={url} mime={mime} encryption={encryption} description={description} />;
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
          {encryption
            ? <DecryptDownloadButton url={url} encryption={encryption} filename={displayName} />
            : (
              <Button variant="outline" size="sm" className="shrink-0 rounded-full gap-1.5" asChild>
                <a href={url} download>
                  <Download className="size-3.5" />
                  <FormattedMessage id="fileMetadata.download" defaultMessage="Download" />
                </a>
              </Button>
            )}
        </div>
      </div>
      {description && <DescriptionCard text={description} />}
    </div>
  );
}
