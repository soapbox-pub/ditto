import { useMemo } from 'react';
import { FileCog } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { EmbeddedCardShell } from '@/components/EmbeddedCardShell';
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

interface EmbeddedMemoryCardCardProps {
  event: NostrEvent;
  className?: string;
  disableHoverCards?: boolean;
}

/**
 * Compact embedded preview for a memory-card block (kind 38192).
 *
 * The generic embedded fallback dumps the 16 KB hex `content` as body text;
 * this instead decodes the save icon and title and links through to the card
 * viewer. Block 0 and continuation blocks show a system row (no icon).
 */
export function EmbeddedMemoryCardCard({ event, className, disableHoverCards }: EmbeddedMemoryCardCardProps) {
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
  const navigateTo = npub
    ? `memory-cards/${npub}${cardId ? `/${encodeURIComponent(cardId)}` : ''}`
    : '';

  const isSave = !!visual;
  const isHeader = block === 0 || state === 'header';
  const title = visual?.title || tagVal(event, 'title') || '(untitled save)';

  return (
    <EmbeddedCardShell
      pubkey={event.pubkey}
      createdAt={event.created_at}
      navigateTo={navigateTo}
      className={className}
      disableHoverCards={disableHoverCards}
    >
      <div className="flex items-center gap-3 pt-1">
        {isSave ? (
          <MemoryCardIcon frames={visual.frames} size={48} />
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
            <FileCog className="size-5" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-snug">
            {isSave ? title : isHeader ? 'System block' : 'Continuation block'}
          </p>
          {isSave && filename && (
            <p className="truncate font-mono text-[11px] text-muted-foreground">{filename}</p>
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
      </div>
    </EmbeddedCardShell>
  );
}
