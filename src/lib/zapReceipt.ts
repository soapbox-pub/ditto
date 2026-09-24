import { verifyEvent } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { decodeBolt11 } from '@/lib/bolt11';
import { isNostrId } from '@/lib/nostrId';

function tagValue(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/**
 * Check that a kind 9735 zap receipt is internally consistent (NIP-57
 * Appendix F), so its sender, recipient and amount can be trusted as far as
 * the receipt's signer can be:
 *
 * - `description` is a validly signed kind 9734 zap request, whose author is
 *   the sender.
 * - The `bolt11` invoice decodes and has an amount, which is the amount
 *   the receipt is for. Its description hash and the request's `amount` tag
 *   aren't compared with it: widely used providers hash a different
 *   serialization of the request than the one they embed, or add fees to
 *   the invoice, so those checks reject real zaps.
 * - The receipt's `P`, `p` and `e` tags match the request's author, recipient
 *   and target.
 *
 * This doesn't prove the invoice was paid, or that the receipt came from the
 * recipient's LNURL server. For that, compare `event.pubkey` with the
 * `nostrPubkey` their LNURL endpoint advertises.
 */
export function isValidZapReceipt(event: NostrEvent): boolean {
  if (event.kind !== 9735) return false;

  const description = tagValue(event.tags, 'description');
  if (!description) return false;

  let request: NostrEvent;
  try {
    request = JSON.parse(description);
  } catch {
    return false;
  }
  if (!request || typeof request !== 'object' || request.kind !== 9734) return false;
  if (!Array.isArray(request.tags) || !isNostrId(request.pubkey)) return false;
  try {
    if (!verifyEvent(request)) return false;
  } catch {
    return false;
  }

  if (!zapReceiptAmountMsat(event)) return false;

  const sender = tagValue(event.tags, 'P');
  if (sender !== undefined && sender !== request.pubkey) return false;

  const recipient = tagValue(request.tags, 'p');
  if (!recipient || tagValue(event.tags, 'p') !== recipient) return false;

  const target = tagValue(request.tags, 'e');
  if (target !== undefined && tagValue(event.tags, 'e') !== target) return false;

  return true;
}

/**
 * The amount a zap receipt is for, in millisats: the amount of its `bolt11`
 * invoice. Returns 0 if the invoice is missing, malformed or amountless.
 */
export function zapReceiptAmountMsat(event: NostrEvent): number {
  const bolt11 = tagValue(event.tags, 'bolt11');
  if (!bolt11) return 0;
  try {
    return decodeBolt11(bolt11).amountMsat ?? 0;
  } catch {
    return 0;
  }
}
