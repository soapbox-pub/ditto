import type { NostrEvent } from '@nostrify/nostrify';

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
