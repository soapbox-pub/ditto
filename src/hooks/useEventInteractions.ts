import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { isCustomEmoji, getCustomEmojiUrl } from '@/lib/customEmoji';
import { isNostrId } from '@/lib/nostrId';
import { zapReceiptAmountMsat } from '@/lib/zapReceipt';

export interface RepostEntry {
  eventId: string;
  pubkey: string;
  createdAt: number;
}

export interface ReactionEntry {
  /** The kind 7 reaction event's ID. */
  eventId: string;
  pubkey: string;
  emoji: string;
  /** For NIP-30 custom emojis, the image URL. */
  emojiUrl?: string;
  createdAt: number;
}

export interface ZapEntry {
  eventId: string;
  senderPubkey: string;
  amountSats: number;
  message: string;
  createdAt: number;
}

export interface QuoteEntry {
  pubkey: string;
  eventId: string;
  content: string;
  createdAt: number;
}

export interface EventInteractions {
  reposts: RepostEntry[];
  quotes: QuoteEntry[];
  reactions: ReactionEntry[];
  zaps: ZapEntry[];
}

/**
 * Extracts the zap amount in millisatoshis from a kind 9735 zap receipt: the
 * amount of its bolt11 invoice. The receipt's and the request's `amount` tags
 * are claims; the invoice is what was paid.
 */
export function extractZapAmount(event: NostrEvent): number {
  return zapReceiptAmountMsat(event);
}

/**
 * Extracts the sender pubkey from a kind 9735 zap receipt.
 *
 * Returns `''` (empty string sentinel) when the receipt has no usable sender
 * pubkey OR when the value present isn't a valid 64-char hex string. The
 * empty-string sentinel lets callers `useMemo` the result without dealing
 * with `undefined` while still being safely falsy at gate points like
 * `useAuthor(sender || undefined)`.
 */
export function extractZapSender(event: NostrEvent): string {
  // First check the P tag (uppercase) which NIP-57 specifies for sender pubkey
  const pTag = event.tags.find(([name]) => name === 'P');
  if (isNostrId(pTag?.[1])) return pTag![1];

  // Fall back to parsing the description (zap request) for the pubkey
  const descTag = event.tags.find(([name]) => name === 'description');
  if (descTag?.[1]) {
    try {
      const zapRequest = JSON.parse(descTag[1]);
      if (isNostrId(zapRequest?.pubkey)) return zapRequest.pubkey;
    } catch {
      // Invalid JSON
    }
  }

  return '';
}

/** Extracts the zap message from a kind 9735 zap receipt. */
export function extractZapMessage(event: NostrEvent): string {
  const descTag = event.tags.find(([name]) => name === 'description');
  if (descTag?.[1]) {
    try {
      const zapRequest = JSON.parse(descTag[1]);
      return zapRequest.content || '';
    } catch {
      // Invalid JSON
    }
  }
  return '';
}

/** Fetches interaction events (reposts, quotes, reactions, zaps) for a given event ID. */
export function useEventInteractions(eventId: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<EventInteractions>({
    queryKey: ['event-interactions', eventId ?? ''],
    queryFn: async ({ signal }) => {
      if (!eventId) return { reposts: [], quotes: [], reactions: [], zaps: [] };

      const timeout = AbortSignal.timeout(5000);
      const combined = AbortSignal.any([signal, timeout]);

      // Single query with two filter objects — relay handles as OR
      const allEvents = await nostr.query(
        [
          { kinds: [6, 16, 7, 9735], '#e': [eventId], limit: 50 },
          { kinds: [1], '#q': [eventId], limit: 20 },
        ],
        { signal: combined },
      );

      const eTagEvents = allEvents.filter(e => e.kind !== 1 || e.tags.some(([n, v]) => n === 'e' && v === eventId));
      const qTagEvents = allEvents.filter(e => e.kind === 1 && e.tags.some(([n, v]) => n === 'q' && v === eventId));

      const reposts: RepostEntry[] = [];
      const quotes: QuoteEntry[] = [];
      const reactions: ReactionEntry[] = [];
      const zaps: ZapEntry[] = [];

      for (const e of eTagEvents) {
        switch (e.kind) {
          case 6:
          case 16:
            reposts.push({
              eventId: e.id,
              pubkey: e.pubkey,
              createdAt: e.created_at,
            });
            break;
          case 7: {
            const rawEmoji = e.content.trim();
            const emoji = (rawEmoji === '+' || rawEmoji === '') ? '👍' : rawEmoji;
            const isCustom = isCustomEmoji(emoji);
            const emojiUrl = isCustom ? getCustomEmojiUrl(emoji, e.tags) : undefined;
            // Skip malformed custom emoji reactions (shortcode without emoji tag)
            if (isCustom && !emojiUrl) break;
            reactions.push({
              eventId: e.id,
              pubkey: e.pubkey,
              emoji,
              emojiUrl,
              createdAt: e.created_at,
            });
            break;
          }
          case 9735: {
            const msats = extractZapAmount(e);
            const senderPubkey = extractZapSender(e);
            if (msats > 0 && senderPubkey) {
              zaps.push({
                eventId: e.id,
                senderPubkey,
                amountSats: Math.floor(msats / 1000),
                message: extractZapMessage(e),
                createdAt: e.created_at,
              });
            }
            break;
          }
        }
      }

      for (const e of qTagEvents) {
        quotes.push({
          pubkey: e.pubkey,
          eventId: e.id,
          content: e.content,
          createdAt: e.created_at,
        });
      }

      // Sort by most recent first
      reposts.sort((a, b) => b.createdAt - a.createdAt);
      quotes.sort((a, b) => b.createdAt - a.createdAt);
      reactions.sort((a, b) => b.createdAt - a.createdAt);
      zaps.sort((a, b) => b.amountSats - a.amountSats); // Sort zaps by amount (largest first)

      return { reposts, quotes, reactions, zaps };
    },
    enabled: !!eventId,
    staleTime: 60 * 1000,
  });
}
