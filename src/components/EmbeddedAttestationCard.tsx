import { useMemo } from 'react';
import { nip19 } from 'nostr-tools';
import { ShieldCheck } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { EmbeddedCardShell } from '@/components/EmbeddedCardShell';
import { AttestationStatePill } from '@/components/AttestationContent';
import { parseAttestation, attestationValidityText } from '@/lib/attestation';

/**
 * Compact inline card for kind 31871 Attestation events, used by both the
 * nevent (`EmbeddedNote`) and naddr (`EmbeddedNaddr`) embed dispatchers.
 *
 * Shows the state pill, validity window, and a clamped description. The
 * assertion-event target is intentionally not embedded to avoid nesting;
 * clicking through to the detail page shows the full card.
 */
export function EmbeddedAttestationCard({
  event,
  className,
  disableHoverCards,
}: {
  event: NostrEvent;
  className?: string;
  disableHoverCards?: boolean;
}) {
  const attestation = useMemo(() => parseAttestation(event), [event]);

  // Addressable kind — always navigate via naddr so the detail page can
  // resolve the latest revision of the attestation.
  const naddrId = useMemo(() => {
    const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
  }, [event]);

  const validity = attestation
    ? attestationValidityText(attestation.validFrom, attestation.validTo)
    : undefined;

  return (
    <EmbeddedCardShell
      pubkey={event.pubkey}
      createdAt={event.created_at}
      navigateTo={naddrId}
      className={className}
      disableHoverCards={disableHoverCards}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <ShieldCheck className="size-3" aria-hidden="true" />
        Attestation
      </div>

      {attestation ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <AttestationStatePill state={attestation.state} />
            {validity && <span className="text-xs text-muted-foreground">{validity}</span>}
          </div>
          {attestation.description && (
            <p dir="auto" className="text-sm leading-relaxed whitespace-pre-wrap break-words line-clamp-3 text-foreground">
              {attestation.description}
            </p>
          )}
        </>
      ) : (
        <p className="text-xs italic text-muted-foreground">Malformed attestation</p>
      )}
    </EmbeddedCardShell>
  );
}
