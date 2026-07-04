import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FileCog, ChevronRight } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { MemoryCardIcon } from '@/components/MemoryCardIcon';
import { tryNpubEncode } from '@/lib/safeNip19';
import {
  blockOf,
  cardIdOf,
  decodeBlockVisual,
  hexToBytes,
  regionFlag,
  tagVal,
} from '@/lib/memorycard';

/**
 * Feed-card renderer for a NIP-XX memory-card block event (kind 38192).
 *
 * Each event is one 8 KB block of a PS1 memory card. Save blocks decode to an
 * animated icon and BIOS title; block 0 and continuation blocks have no icon,
 * so they render as a compact system row. The whole card links through to the
 * full card viewer at `/cards/:npub/:cardId`.
 */
export function MemoryCardContent({ event }: { event: NostrEvent }) {
  const visual = useMemo(() => {
    try {
      return decodeBlockVisual(hexToBytes(event.content));
    } catch {
      return null;
    }
  }, [event.content]);

  const cardId = cardIdOf(event);
  const block = blockOf(event);
  const state = tagVal(event, 'state');
  const filename = tagVal(event, 'filename');
  const region = tagVal(event, 'region');
  const flag = regionFlag(region, filename);

  const npub = tryNpubEncode(event.pubkey);
  const cardHref =
    npub && cardId ? `/ps1/${npub}/${encodeURIComponent(cardId)}` : undefined;

  const title = visual?.title || tagVal(event, 'title') || '(untitled save)';
  const isSave = !!visual;
  const isHeader = block === 0 || state === 'header';

  const body = (
    <div className="mt-2 flex items-center gap-3 rounded-xl border border-border bg-secondary/30 p-3 transition-colors hover:bg-secondary/50">
      {isSave ? (
        <MemoryCardIcon frames={visual.frames} size={56} />
      ) : (
        <div className="flex size-14 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
          <FileCog className="size-6" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-snug">
          {isSave ? title : isHeader ? 'System block' : 'Continuation block'}
        </p>
        {isSave && filename && (
          <p className="truncate font-mono text-xs text-muted-foreground">{filename}</p>
        )}
        {!isSave && (
          <p className="truncate text-xs text-muted-foreground">
            {isHeader ? 'Header & directory' : 'Part of a multi-block save'}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {cardId && (
            <span className="rounded border border-border bg-background px-1.5 py-0.5 font-mono">
              {cardId}
            </span>
          )}
          {block >= 0 && (
            <span className="rounded border border-border bg-background px-1.5 py-0.5 font-mono">
              block #{block}
            </span>
          )}
          {region && (
            <span className="rounded border border-border bg-background px-1.5 py-0.5">
              {flag ? `${flag} ` : ''}
              {region}
            </span>
          )}
        </div>
      </div>

      {cardHref && <ChevronRight className="size-5 shrink-0 text-muted-foreground" />}
    </div>
  );

  if (!cardHref) return body;

  return (
    <Link to={cardHref} className="block" onClick={(e) => e.stopPropagation()}>
      {body}
    </Link>
  );
}
