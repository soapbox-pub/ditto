import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FormattedMessage, useIntl } from 'react-intl';
import { Copy, ExternalLink, File, Magnet } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { EmbeddedCardShell } from '@/components/EmbeddedCardShell';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/useToast';
import { openUrl } from '@/lib/downloadFile';
import { encodeEventAddress } from '@/lib/encodeEvent';
import { formatBytes } from '@/lib/formatBytes';
import { buildMagnetUri, parseTorrent, torrentDisplayTitle, type ParsedTorrent } from '@/lib/torrent';
import { cn } from '@/lib/utils';

/** Files listed on the detail page before "Show all". */
const FILE_PREVIEW_LIMIT = 50;

/** Hashtags shown on the feed card. */
const FEED_HASHTAG_LIMIT = 4;

interface TorrentContentProps {
  event: NostrEvent;
  /** Detail-page rendering: full description, file list, trackers, and hash. */
  expanded?: boolean;
  className?: string;
}

/**
 * Card for kind 2003 (NIP-35 torrent).
 *
 * The event is an index entry, not a file: Ditto builds a magnet link from the
 * info hash and trackers and hands it to the user's torrent client. The
 * description is pre-formatted plain text and is never run through the kind-1
 * tokenizer — it is typically release notes from elsewhere, not the author's
 * own prose.
 */
export function TorrentContent({ event, expanded, className }: TorrentContentProps) {
  const torrent = useMemo(() => parseTorrent(event), [event]);

  if (!torrent) return null;

  return expanded
    ? <TorrentDetail torrent={torrent} className={className} />
    : <TorrentFeedCard torrent={torrent} className={className} />;
}

// ─── Shared pieces ─────────────────────────────────────────────

function TorrentTitle({ torrent }: { torrent: ParsedTorrent }) {
  const title = torrentDisplayTitle(torrent);
  return title
    ? <>{title}</>
    : <FormattedMessage id="torrent.untitled" defaultMessage="Untitled torrent" />;
}

/** "4.2 GB · 12 files · video › movie › 4k" */
function TorrentMeta({ torrent, className }: { torrent: ParsedTorrent; className?: string }) {
  const parts: React.ReactNode[] = [];
  if (torrent.totalSize !== undefined) {
    parts.push(<span key="size">{formatBytes(torrent.totalSize)}</span>);
  }
  if (torrent.files.length > 0) {
    parts.push(
      <span key="files">
        <FormattedMessage
          id="torrent.fileCount"
          defaultMessage="{count, plural, one {# file} other {# files}}"
          values={{ count: torrent.files.length }}
        />
      </span>,
    );
  }
  if (torrent.categories.length > 0) {
    parts.push(<span key="cat" className="truncate">{torrent.categories.join(' › ')}</span>);
  }

  if (parts.length === 0) return null;

  return (
    <p className={cn('flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground', className)}>
      {parts.map((part, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          {i > 0 && <span aria-hidden="true">·</span>}
          {part}
        </span>
      ))}
    </p>
  );
}

function HashtagChips({ hashtags }: { hashtags: string[] }) {
  if (hashtags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {hashtags.map((tag) => (
        <Link
          key={tag}
          to={`/t/${encodeURIComponent(tag)}`}
          onClick={(e) => e.stopPropagation()}
          className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          #{tag}
        </Link>
      ))}
    </div>
  );
}

function useCopy() {
  const intl = useIntl();
  return async (text: string, title: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title });
    } catch {
      toast({
        title: intl.formatMessage({ id: 'torrent.copyFailed', defaultMessage: 'Could not copy to clipboard' }),
        variant: 'destructive',
      });
    }
  };
}

function MagnetActions({ torrent, size }: { torrent: ParsedTorrent; size?: 'sm' | 'default' }) {
  const intl = useIntl();
  const copy = useCopy();
  const magnet = useMemo(() => buildMagnetUri(torrent), [torrent]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size={size}
        onClick={(e) => {
          e.stopPropagation();
          openUrl(magnet);
        }}
      >
        <Magnet aria-hidden="true" />
        <FormattedMessage id="torrent.openMagnet" defaultMessage="Open magnet link" />
      </Button>
      <Button
        size={size}
        variant="outline"
        onClick={(e) => {
          e.stopPropagation();
          copy(magnet, intl.formatMessage({ id: 'torrent.magnetCopied', defaultMessage: 'Magnet link copied' }));
        }}
      >
        <Copy aria-hidden="true" />
        <FormattedMessage id="torrent.copyMagnet" defaultMessage="Copy magnet" />
      </Button>
    </div>
  );
}

function ExternalIdLinks({ torrent }: { torrent: ParsedTorrent }) {
  if (torrent.externalIds.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {torrent.externalIds.map((id) => (
        <a
          key={id.url}
          href={id.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            openUrl(id.url);
          }}
          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {id.label}
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}

// ─── Feed card ─────────────────────────────────────────────────

function TorrentFeedCard({ torrent, className }: { torrent: ParsedTorrent; className?: string }) {
  const description = torrent.description.trim();

  return (
    <div className={cn('mt-2 space-y-3 rounded-2xl border border-border p-3.5', className)}>
      <div className="flex gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Magnet className="size-5 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p dir="auto" className="line-clamp-2 break-words text-[15px] font-semibold leading-snug">
            <TorrentTitle torrent={torrent} />
          </p>
          <TorrentMeta torrent={torrent} />
        </div>
      </div>

      {description && (
        <p dir="auto" className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">
          {description}
        </p>
      )}

      <HashtagChips hashtags={torrent.hashtags.slice(0, FEED_HASHTAG_LIMIT)} />

      <MagnetActions torrent={torrent} size="sm" />
    </div>
  );
}

// ─── Detail ────────────────────────────────────────────────────

function TorrentDetail({ torrent, className }: { torrent: ParsedTorrent; className?: string }) {
  const intl = useIntl();
  const copy = useCopy();
  const [showAllFiles, setShowAllFiles] = useState(false);
  const description = torrent.description.trim();
  const files = showAllFiles ? torrent.files : torrent.files.slice(0, FILE_PREVIEW_LIMIT);

  return (
    <div className={cn('mt-4 space-y-7', className)}>
      {/* Hero */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Magnet className="size-6 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h1 dir="auto" className="break-words text-2xl font-bold leading-tight">
              <TorrentTitle torrent={torrent} />
            </h1>
            <TorrentMeta torrent={torrent} className="text-sm" />
          </div>
        </div>
        <HashtagChips hashtags={torrent.hashtags} />
        <ExternalIdLinks torrent={torrent} />
        <div className="pt-1">
          <MagnetActions torrent={torrent} />
        </div>
      </div>

      {description && (
        <section className="border-t border-border pt-5">
          <SectionHeading>
            <FormattedMessage id="torrent.description" defaultMessage="Description" />
          </SectionHeading>
          <pre dir="auto" className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-muted/50 p-4 font-mono text-[13px] leading-relaxed">
            {description}
          </pre>
        </section>
      )}

      {torrent.files.length > 0 && (
        <section className="border-t border-border pt-5">
          <SectionHeading>
            <FormattedMessage
              id="torrent.filesHeading"
              defaultMessage="Files ({count})"
              values={{ count: torrent.files.length }}
            />
          </SectionHeading>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border">
            {files.map((file, i) => (
              <li key={`${i}:${file.path}`} className="flex items-center gap-3 px-3 py-2">
                <File className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span dir="auto" className="min-w-0 flex-1 break-all text-sm">{file.path}</span>
                {file.size !== undefined && (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatBytes(file.size)}</span>
                )}
              </li>
            ))}
          </ul>
          {torrent.files.length > FILE_PREVIEW_LIMIT && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setShowAllFiles((v) => !v)}
            >
              {showAllFiles ? (
                <FormattedMessage id="torrent.showFewerFiles" defaultMessage="Show fewer files" />
              ) : (
                <FormattedMessage
                  id="torrent.showAllFiles"
                  defaultMessage="Show all {count} files"
                  values={{ count: torrent.files.length }}
                />
              )}
            </Button>
          )}
        </section>
      )}

      <section className="border-t border-border pt-5">
        <SectionHeading>
          <FormattedMessage id="torrent.details" defaultMessage="Details" />
        </SectionHeading>
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="mb-1 text-muted-foreground">
              <FormattedMessage id="torrent.infoHash" defaultMessage="Info hash" />
            </dt>
            <dd className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-[13px]">{torrent.infoHash}</code>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label={intl.formatMessage({ id: 'torrent.copyInfoHash', defaultMessage: 'Copy info hash' })}
                onClick={() => copy(torrent.infoHash, intl.formatMessage({ id: 'torrent.infoHashCopied', defaultMessage: 'Info hash copied' }))}
              >
                <Copy className="size-4" aria-hidden="true" />
              </Button>
            </dd>
          </div>
          {torrent.trackers.length > 0 && (
            <div>
              <dt className="mb-1 text-muted-foreground">
                <FormattedMessage id="torrent.trackers" defaultMessage="Trackers" />
              </dt>
              <dd>
                <ul className="space-y-1">
                  {torrent.trackers.map((tracker) => (
                    <li key={tracker} className="break-all font-mono text-[13px]">{tracker}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      </section>
    </div>
  );
}

// ─── Embedded ──────────────────────────────────────────────────

interface EmbeddedTorrentCardProps {
  event: NostrEvent;
  className?: string;
  disableHoverCards?: boolean;
}

/** Compact quote-embed card for kind 2003: title and size/files line. */
export function EmbeddedTorrentCard({ event, className, disableHoverCards }: EmbeddedTorrentCardProps) {
  const torrent = useMemo(() => parseTorrent(event), [event]);
  const nip19Id = useMemo(() => encodeEventAddress(event), [event]);

  return (
    <EmbeddedCardShell
      pubkey={event.pubkey}
      createdAt={event.created_at}
      navigateTo={nip19Id}
      className={className}
      disableHoverCards={disableHoverCards}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Magnet className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <p dir="auto" className="line-clamp-1 text-sm font-semibold leading-snug">
          {torrent ? (
            <TorrentTitle torrent={torrent} />
          ) : (
            <FormattedMessage id="torrent.invalid" defaultMessage="Torrent with no info hash" />
          )}
        </p>
      </div>
      {torrent && <TorrentMeta torrent={torrent} />}
    </EmbeddedCardShell>
  );
}
