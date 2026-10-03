import { useState } from 'react';
import {
  Box, Download, File, FileArchive, FileAudio, FileCode, FileImage, FileSpreadsheet,
  FileText, FileType, FileVideo, Loader2, Presentation, Puzzle,
} from 'lucide-react';
import { useIntl } from 'react-intl';

import { DecryptedImage } from '@/components/DecryptedImage';
import { useToast } from '@/hooks/useToast';
import { downloadDecryptedUrl, downloadUrl } from '@/lib/downloadFile';
import { companionEncryption } from '@/lib/encryptedFile';
import { formatBytes } from '@/lib/formatBytes';
import type { ImetaEntry } from '@/lib/imeta';
import { fileCategory, mimeFromExt, urlExtension, type FileCategory } from '@/lib/mediaUrls';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

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
 * An attachment Ditto has no player for. Shows the file's name, type, size and
 * summary from its imeta, its preview image when it has one, and saves it on
 * request.
 */
export function FileAttachmentCard({ url, imeta, className }: FileAttachmentCardProps) {
  const intl = useIntl();
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const safe = sanitizeUrl(url);
  if (!safe) return null;

  const ext = urlExtension(safe);
  const mime = imeta?.mime || (ext ? mimeFromExt(ext) : undefined);
  const category = fileCategory(mime);
  const Icon = mime?.startsWith('image/') ? FileImage : CATEGORY_ICONS[category];
  const encryption = imeta?.encryption;

  // A Blossom URL is a hash; the uploader's filename travels as `alt`.
  const name = imeta?.alt?.trim() || urlFilename(safe) || intl.formatMessage({ id: 'fileCard.untitled', defaultMessage: 'Attachment' });
  const size = imeta?.size ? Number(imeta.size) : undefined;
  const details = [typeLabel(safe, mime), size && Number.isFinite(size) ? formatBytes(size) : undefined].filter(Boolean).join(' · ');
  const preview = imeta?.thumbnail ? sanitizeUrl(imeta.thumbnail) : undefined;

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
      className={cn('my-2.5 w-full max-w-md overflow-hidden rounded-xl border border-border bg-card whitespace-normal', className)}
      onClick={(e) => e.stopPropagation()}
    >
      {preview && (
        <div className="bg-muted">
          <DecryptedImage
            url={preview}
            encryption={encryption ? companionEncryption(encryption) : undefined}
            alt=""
            loading="lazy"
            decoding="async"
            className="block max-h-80 w-full object-contain"
          />
        </div>
      )}

      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={name}>{name}</p>
          {details && <p className="truncate text-xs text-muted-foreground tabular-nums">{details}</p>}
          {imeta?.summary && (
            <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">{imeta.summary}</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          aria-label={intl.formatMessage({ id: 'fileCard.download', defaultMessage: 'Download {name}' }, { name })}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {downloading ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />}
        </button>
      </div>
    </div>
  );
}
