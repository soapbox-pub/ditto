import { Download, FileVideo } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';

import { openUrl } from '@/lib/downloadFile';
import { formatBytes } from '@/lib/formatBytes';
import { urlExtension } from '@/lib/mediaUrls';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

interface VideoFileCardProps {
  url: string;
  /** Declared MIME type (imeta `m`), used for the type label when the URL has no extension. */
  mime?: string;
  /** File size in bytes, when declared. */
  size?: number;
}

/**
 * A video the browser can't play inline (AVI, WMV, FLV, …), offered as a file
 * to open instead of a `<video>` that would never start. The type token is
 * always visible, since a content-addressed filename says nothing about format.
 */
export function VideoFileCard({ url, mime, size }: VideoFileCardProps) {
  const intl = useIntl();
  const safe = sanitizeUrl(url);
  if (!safe) return null;

  const ext = urlExtension(safe);
  const kind = ext
    ? ext.toUpperCase()
    : (mime?.split('/')[1] ?? '').replace(/^x-/, '').replace(/^vnd\./, '').toUpperCase() || null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void openUrl(safe);
      }}
      aria-label={intl.formatMessage({ id: 'videoFileCard.open', defaultMessage: 'Open video file' })}
      className="group my-2 flex w-full max-w-sm items-center gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <FileVideo className="size-8 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">
          <FormattedMessage id="videoFileCard.title" defaultMessage="Video file" />
        </span>
        <span className="block text-xs text-muted-foreground tabular-nums">
          {[kind, size ? formatBytes(size) : null].filter(Boolean).join(' · ')}
          {(kind || size) ? ' · ' : ''}
          <FormattedMessage id="videoFileCard.hint" defaultMessage="Can't play here — tap to open" />
        </span>
      </span>
      <Download className="size-5 shrink-0 text-muted-foreground group-hover:text-foreground" />
    </button>
  );
}
