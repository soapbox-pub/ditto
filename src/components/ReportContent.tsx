import { useMemo, useState } from 'react';
import { Eye, Flag, FileWarning, UserX } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { EmbeddedNote } from '@/components/EmbeddedNote';
import { NostrMention } from '@/components/NostrMention';
import { parseReport, REPORT_TYPE_LABELS, type ReportType } from '@/lib/report';
import { displayHost } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

interface ReportContentProps {
  event: NostrEvent;
  /** When true, render a larger variant for the detail page. */
  expanded?: boolean;
  className?: string;
}

/** Report types serious enough to warrant a destructive-colored pill. */
const SEVERE_TYPES = new Set<ReportType>(['illegal', 'malware']);

/** Shared section heading style — matches the other kind cards. */
const SECTION_LABEL = 'flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

/**
 * Colored pill naming the report type — shared with the embed card.
 *
 * `rawType` renders types outside the NIP-56 list (clients do invent them)
 * without dressing them up as one of the known categories.
 */
export function ReportTypePill({
  type,
  rawType,
  className,
}: {
  type?: ReportType;
  rawType?: string;
  className?: string;
}) {
  const label = type
    ? REPORT_TYPE_LABELS[type]
    : rawType
      ? rawType.charAt(0).toUpperCase() + rawType.slice(1)
      : 'Report';

  const style = type && SEVERE_TYPES.has(type)
    ? 'border-destructive/30 bg-destructive/10 text-destructive'
    : type
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
      : 'border-border bg-secondary text-muted-foreground';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        style,
        className,
      )}
    >
      <Flag className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Renders a kind 1984 Report event (NIP-56) — one user's claim that a post,
 * profile, or file is objectionable.
 *
 * - The report type renders as a colored pill.
 * - `content` (the reporter's explanation) renders as plaintext, never
 *   through the kind-1 tokenizer: report reasons routinely quote or link the
 *   material being reported, and auto-embedding that media would republish
 *   exactly what the report is warning about.
 * - The reported post stays collapsed behind a reveal button for the same
 *   reason — a report is by definition a pointer at content someone found
 *   objectionable, so it shouldn't render unprompted in a feed. That also
 *   keeps the embed's relay round-trip from firing until asked for.
 * - Reported profiles render as a mention, and reported blobs as their hash
 *   plus the hosts named in `server` tags (as text — these are not links).
 */
export function ReportContent({
  event,
  expanded = false,
  className,
}: ReportContentProps) {
  const report = useMemo(() => parseReport(event), [event]);
  const [revealed, setRevealed] = useState(false);

  if (!report) {
    // No `p`, `e`, or `x` tag — the report names no target at all.
    return (
      <div className={cn('mt-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground', className)}>
        Malformed report
      </div>
    );
  }

  const { type, rawType, reason, pubkey, blob, event: reportedEvent } = report;

  return (
    <div className={cn(expanded ? 'mt-3 space-y-3' : 'mt-2 space-y-2.5', className)}>
      <ReportTypePill type={type} rawType={rawType} />

      {/* The reporter's explanation — plaintext, never tokenized */}
      {reason && (
        <p
          dir="auto"
          className={cn(
            'whitespace-pre-wrap break-words text-foreground',
            expanded ? 'text-[17px] leading-relaxed' : 'text-[15px] leading-relaxed',
          )}
        >
          {reason}
        </p>
      )}

      {/* The reported post, behind a reveal */}
      {reportedEvent && (
        <div className="space-y-1.5">
          <div className={SECTION_LABEL}>
            <Flag className="size-3" aria-hidden="true" />
            Reported post
          </div>
          {revealed ? (
            <EmbeddedNote
              eventId={reportedEvent.id}
              relays={reportedEvent.relays}
              authorHint={reportedEvent.authorHint}
              className="my-0"
            />
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRevealed(true);
              }}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border',
                'bg-muted/30 px-4 py-3 text-sm text-muted-foreground transition-colors',
                'hover:bg-secondary/60 hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              )}
            >
              <Eye className="size-4" aria-hidden="true" />
              Show reported post
            </button>
          )}
        </div>
      )}

      {/* A reported profile. When an event was reported, the `p` tag names
          that event's author rather than a separate target, so it's covered
          by the embed above. */}
      {!reportedEvent && pubkey && (
        <div className="space-y-1.5">
          <div className={SECTION_LABEL}>
            <UserX className="size-3" aria-hidden="true" />
            Reported user
          </div>
          <div className="text-[15px]">
            <NostrMention pubkey={pubkey} />
          </div>
        </div>
      )}

      {/* A reported blob */}
      {blob && (
        <div className="space-y-1.5">
          <div className={SECTION_LABEL}>
            <FileWarning className="size-3" aria-hidden="true" />
            Reported file
          </div>
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 space-y-1">
            <p className="font-mono text-xs break-all text-muted-foreground">{blob.hash}</p>
            {blob.servers.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Hosted on {blob.servers.map(displayHost).join(', ')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
