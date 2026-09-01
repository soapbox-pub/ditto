import { useMemo } from 'react';
import { FormattedMessage } from 'react-intl';
import { Server } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { EmbeddedCardShell } from '@/components/EmbeddedCardShell';
import { RelayAvatarStack } from '@/components/RelayAvatarStack';
import { encodeEventAddress } from '@/lib/encodeEvent';
import { parseRelayList } from '@/lib/relayList';

/** Relays previewed in the embed's icon stack. */
const EMBED_STACK_LIMIT = 5;

interface EmbeddedRelayListCardProps {
  event: NostrEvent;
  className?: string;
  disableHoverCards?: boolean;
}

/**
 * Compact embedded card for kind 10002 (NIP-65 relay list).
 *
 * The generic embedded fallbacks render an empty shell for this kind — a relay
 * list's `content` is empty and all its data lives in `r` tags — so this card
 * shows a relay count and an icon stack of the first few.
 */
export function EmbeddedRelayListCard({ event, className, disableHoverCards }: EmbeddedRelayListCardProps) {
  const relays = useMemo(() => parseRelayList(event), [event]);
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
        <Server className="size-3.5 shrink-0 text-primary" />
        <p className="line-clamp-1 text-sm font-semibold leading-snug">
          <FormattedMessage
            id="relayList.embedTitle"
            defaultMessage="Relay list · {count, plural, one {# relay} other {# relays}}"
            values={{ count: relays.length }}
          />
        </p>
      </div>

      <RelayAvatarStack relays={relays} maxVisible={EMBED_STACK_LIMIT} size="sm" />
    </EmbeddedCardShell>
  );
}
