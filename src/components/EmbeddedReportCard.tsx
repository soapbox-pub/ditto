import { useMemo } from 'react';
import { nip19 } from 'nostr-tools';
import { Flag } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { EmbeddedCardShell } from '@/components/EmbeddedCardShell';
import { ReportTypePill } from '@/components/ReportContent';
import { parseReport } from '@/lib/report';

/**
 * Compact inline card for kind 1984 NIP-56 report events.
 *
 * Shows the report-type pill and a clamped reason. The reported target is
 * intentionally not embedded — both to avoid nesting and because a quote of a
 * report shouldn't surface the reported content; clicking through to the
 * detail page offers it behind a reveal.
 */
export function EmbeddedReportCard({
  event,
  className,
  disableHoverCards,
}: {
  event: NostrEvent;
  className?: string;
  disableHoverCards?: boolean;
}) {
  const report = useMemo(() => parseReport(event), [event]);

  const neventId = useMemo(
    () => nip19.neventEncode({ id: event.id, author: event.pubkey }),
    [event.id, event.pubkey],
  );

  return (
    <EmbeddedCardShell
      pubkey={event.pubkey}
      createdAt={event.created_at}
      navigateTo={neventId}
      className={className}
      disableHoverCards={disableHoverCards}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Flag className="size-3" aria-hidden="true" />
        Report
      </div>

      {report ? (
        <>
          <ReportTypePill type={report.type} rawType={report.rawType} />
          {report.reason && (
            <p dir="auto" className="text-sm leading-relaxed whitespace-pre-wrap break-words line-clamp-3 text-foreground">
              {report.reason}
            </p>
          )}
        </>
      ) : (
        <p className="text-xs italic text-muted-foreground">Malformed report</p>
      )}
    </EmbeddedCardShell>
  );
}
