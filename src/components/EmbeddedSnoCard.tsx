import type { NostrEvent } from '@nostrify/nostrify';

import { EmbeddedCardShell } from '@/components/EmbeddedCardShell';
import { SnoContent } from '@/components/SnoContent';
import { tryNaddrEncode } from '@/lib/safeNip19';

interface EmbeddedSnoCardProps {
  event: NostrEvent;
  className?: string;
  disableHoverCards?: boolean;
}

/** Quote embed for a Simple Nostr Object (kind 33331): the same still and 3D viewer as its feed card. */
export function EmbeddedSnoCard({ event, className, disableHoverCards }: EmbeddedSnoCardProps) {
  const identifier = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
  const naddr = tryNaddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier }) ?? '';

  return (
    <EmbeddedCardShell
      pubkey={event.pubkey}
      createdAt={event.created_at}
      navigateTo={naddr}
      className={className}
      disableHoverCards={disableHoverCards}
    >
      <SnoContent event={event} className="mb-1" />
    </EmbeddedCardShell>
  );
}
