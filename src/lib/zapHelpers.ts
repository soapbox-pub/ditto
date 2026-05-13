import type { NostrEvent } from '@nostrify/nostrify';
import { extractZapAmount } from '@/hooks/useEventInteractions';

/**
 * Extracts the zap amount in sats from either a kind 9735 Lightning zap
 * receipt or a kind 8333 on-chain Bitcoin zap event.
 *
 * Kind 9735 (NIP-57): the amount may live in (in order) the receipt's
 * `amount` tag (millisats), the embedded zap-request JSON's `amount` tag
 * (millisats), or — as a last resort — encoded inside the `bolt11`
 * invoice itself. Some LNURL providers omit the `amount` tag entirely
 * and rely solely on bolt11, which is why callers that don't fall back
 * to bolt11 will display "X zapped you" with no amount.
 *
 * Kind 8333: the `amount` tag carries sats directly (see NIP.md).
 *
 * Returns 0 when no amount can be determined.
 */
export function getZapAmountSats(event: NostrEvent): number {
  if (event.kind === 8333) {
    const amountTag = event.tags.find(([name]) => name === 'amount');
    if (amountTag?.[1]) {
      const sats = parseInt(amountTag[1], 10);
      if (!isNaN(sats) && sats > 0) return sats;
    }
    return 0;
  }

  // Kind 9735: extractZapAmount returns millisats and already falls back
  // through amount tag → description.tags amount → bolt11 invoice.
  const msats = extractZapAmount(event);
  return Math.floor(msats / 1000);
}

/**
 * Extracts the sender pubkey from a zap event.
 *
 * Kind 9735: the receipt is signed by the LNURL provider, so the sender
 * lives in the uppercase `P` tag (preferred) or in the `description`
 * JSON's `pubkey` (the original zap request). Falls back to the event's
 * own pubkey, which is the LNURL provider — not great, but better than
 * an empty string.
 *
 * Kind 8333: the sender authors the event themselves, so `event.pubkey`
 * IS the sender (see NIP.md).
 */
export function getZapSenderPubkey(event: NostrEvent): string {
  if (event.kind === 8333) return event.pubkey;

  const pTag = event.tags.find(([name]) => name === 'P');
  if (pTag?.[1]) return pTag[1];
  const descTag = event.tags.find(([name]) => name === 'description');
  if (descTag?.[1]) {
    try {
      const zapRequest = JSON.parse(descTag[1]);
      if (zapRequest.pubkey) return zapRequest.pubkey;
    } catch { /* ignore */ }
  }
  return event.pubkey;
}

/**
 * Returns the ID of the target event being zapped/reacted-to/reposted, if
 * any. Reads the first `e` tag, which by convention points at the target.
 */
export function getTargetEventId(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === 'e')?.[1];
}
