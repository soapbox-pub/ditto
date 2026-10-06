import { lazy, Suspense, useState } from 'react';
import {
  Box, Download, File, FileArchive, FileAudio, FileCode, FileImage, FileSpreadsheet,
  FileText, FileType, FileVideo, Loader2, Presentation, Puzzle, Rotate3d,
} from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';

import { DecryptedImage } from '@/components/DecryptedImage';
import { useToast } from '@/hooks/useToast';
import { downloadDecryptedUrl, downloadUrl } from '@/lib/downloadFile';
import { companionEncryption } from '@/lib/encryptedFile';
import { formatBytes } from '@/lib/formatBytes';
import type { ImetaEntry } from '@/lib/imeta';
import { fileCategory, mimeFromExt, modelFormat, urlExtension, type FileCategory } from '@/lib/mediaUrls';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

const ModelViewer = lazy(() => import('@/components/ModelViewer'));

const CATEGORY_ICONS: Record<FileCategory, typeof File> = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  model: Box,
  pdf: FileText,
  text: FileCode,
  archive: FileArchive,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  font: FileType,
  webxdc: Puzzle,
  file: File,
};

interface FileAttachmentCardProps {
  url: string;
  imeta?: ImetaEntry;
  className?: string;
}

/** The last path segment of a URL, decoded, or `undefined`. */
function urlFilename(url: string): string | undefined {
  try {
    const segment = new URL(url).pathname.split('/').filter(Boolean).pop();
    return segment ? decodeURIComponent(segment) : undefined;
  } catch {
    return undefined;
  }
}

/** A short type label: the extension, else the MIME subtype. */
function typeLabel(url: string, mime: string | undefined): string | undefined {
  const ext = urlExtension(url);
  if (ext) return ext.toUpperCase();
  const subtype = mime?.split('/')[1]?.split(/[;+]/)[0];
  return subtype?.replace(/^(x-|vnd\.)/, '').toUpperCase() || undefined;
}

/**
 * An attachment Ditto has no player for — or one, like a 3D model, that's
 * worth seeing before downloading. Shows the file's name, type, size and
 * summary from its imeta, its preview image when it has one, and saves it on
 * request. 3D models in a format three.js reads open in an interactive viewer,
 * but only on a tap: models run to tens of megabytes, too much to fetch for
 * everyone who scrolls past.
 */
export function FileAttachmentCard({ url, imeta, className }: FileAttachmentCardProps) {
  const intl = useIntl();
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [viewing3d, setViewing3d] = useState(false);

  const safe = sanitizeUrl(url);
  if (!safe) return null;

  const ext = urlExtension(safe);
  const mime = imeta?.mime || (ext ? mimeFromExt(ext) : undefined);
  const category = fileCategory(mime);
  const Icon = mime?.startsWith('image/') ? FileImage : CATEGORY_ICONS[category];
  const format = modelFormat(mime);
  const encryption = imeta?.encryption;

  // A Blossom URL is a hash; the uploader's filename travels as `alt`.
  const name = imeta?.alt?.trim() || urlFilename(safe) || intl.formatMessage({ id: 'fileCard.untitled', defaultMessage: 'Attachment' });
  const declaredSize = imeta?.size ? Number(imeta.size) : undefined;
  const size = declaredSize && Number.isFinite(declaredSize) && declaredSize > 0 ? declaredSize : undefined;
  const details = [typeLabel(safe, mime), size ? formatBytes(size) : undefined].filter(Boolean).join(' · ');
  const preview = imeta?.thumbnail ? sanitizeUrl(imeta.thumbnail) : undefined;

  const downloadLabel = intl.formatMessage({ id: 'fileCard.download', defaultMessage: 'Download {name}' }, { name });

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    try {
      const filename = name.includes('.') ? name : undefined;
      if (encryption) await downloadDecryptedUrl(safe, encryption, filename);
      else await downloadUrl(safe, filename);
    } catch {
      toast({
        title: intl.formatMessage({ id: 'fileCard.downloadFailed', defaultMessage: 'Download failed' }),
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className={cn('my-2.5 w-full overflow-hidden rounded-xl border border-border bg-card whitespace-normal', className)}
      onClick={(e) => e.stopPropagation()}
    >
      {viewing3d && format ? (
        <div className="relative">
          <Suspense
            fallback={
              <div className="flex aspect-4/3 items-center justify-center bg-muted">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <ModelViewer url={safe} format={format} encryption={encryption} />
          </Suspense>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            aria-label={downloadLabel}
            className="absolute right-3 top-3 z-10 flex size-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-xs backdrop-blur-sm transition-colors hover:bg-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {downloading ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />}
          </button>
        </div>
      ) : (preview || format) ? (
        <div className="relative bg-muted">
          {preview ? (
            <DecryptedImage
              url={preview}
              encryption={encryption ? companionEncryption(encryption) : undefined}
              alt=""
              loading="lazy"
              decoding="async"
              className="block max-h-80 w-full object-contain"
            />
          ) : (
            <div className="flex aspect-4/3 items-center justify-center">
              <Box className="size-16 text-muted-foreground/50" />
            </div>
          )}
          {format && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setViewing3d(true); }}
              className="absolute inset-0 flex items-end justify-center p-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              aria-label={intl.formatMessage({ id: 'fileCard.view3d', defaultMessage: 'View in 3D' })}
            >
              <span className="inline-flex items-center gap-2 rounded-full bg-background/90 px-4 py-2 text-sm font-medium shadow-xs backdrop-blur-sm transition-colors hover:bg-background">
                <Rotate3d className="size-4" />
                <FormattedMessage id="fileCard.view3d" defaultMessage="View in 3D" />
                {size && <span className="text-muted-foreground tabular-nums">· {formatBytes(size)}</span>}
              </span>
            </button>
          )}
        </div>
      ) : null}

      {/* A viewable model is its own card; its download lives in the viewer. */}
      {!format && (
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={name}>{name}</p>
            {details && <p className="truncate text-xs text-muted-foreground tabular-nums">{details}</p>}
            {imeta?.summary && (
              <p className="mt-1 line-clamp-2 wrap-break-word text-xs text-muted-foreground">{imeta.summary}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            aria-label={downloadLabel}
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {downloading ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />}
          </button>
        </div>
      )}
    </div>
  );
}
