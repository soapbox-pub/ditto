import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { isCustomEmoji, getCustomEmojiUrl } from '@/components/CustomEmoji';

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

/** Extracts the zap amount in millisatoshis from a kind 9735 zap receipt. */
function extractZapAmount(event: NostrEvent): number {
  const amountTag = event.tags.find(([name]) => name === 'amount');
  if (amountTag?.[1]) {
    const msats = parseInt(amountTag[1], 10);
    if (!isNaN(msats) && msats > 0) return msats;
  }

  const descTag = event.tags.find(([name]) => name === 'description');
  if (descTag?.[1]) {
    try {
      const zapRequest = JSON.parse(descTag[1]);
      const reqAmountTag = zapRequest.tags?.find(([name]: [string]) => name === 'amount');
      if (reqAmountTag?.[1]) {
        const msats = parseInt(reqAmountTag[1], 10);
        if (!isNaN(msats) && msats > 0) return msats;
      }
    } catch {
      // Invalid JSON
    }
  }

  const bolt11Tag = event.tags.find(([name]) => name === 'bolt11');
  if (bolt11Tag?.[1]) {
    const msats = parseBolt11Amount(bolt11Tag[1]);
    if (msats > 0) return msats;
  }

  return 0;
}

function parseBolt11Amount(bolt11: string): number {
  const match = bolt11.toLowerCase().match(/^ln\w+?(\d+)([munp]?)1/);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  if (isNaN(value)) return 0;
  const multiplier = match[2];
  switch (multiplier) {
    case 'm': return value * 100_000_000;
    case 'u': return value * 100_000;
    case 'n': return value * 100;
    case 'p': return value / 10;
    default:  return value * 100_000_000_000;
  }
}

/** Extracts the sender pubkey from a kind 9735 zap receipt. */
function extractZapSender(event: NostrEvent): string {
  // First check the P tag (uppercase) which NIP-57 specifies for sender pubkey
  const pTag = event.tags.find(([name]) => name === 'P');
  if (pTag?.[1]) return pTag[1];

  // Fall back to parsing the description (zap request) for the pubkey
  const descTag = event.tags.find(([name]) => name === 'description');
  if (descTag?.[1]) {
    try {
      const zapRequest = JSON.parse(descTag[1]);
      if (zapRequest.pubkey) return zapRequest.pubkey;
    } catch {
      // Invalid JSON
    }
  }

  return '';
}

/** Extracts the zap message from a kind 9735 zap receipt. */
function extractZapMessage(event: NostrEvent): string {
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
            const emojiUrl = isCustomEmoji(emoji) ? getCustomEmojiUrl(emoji, e.tags) : undefined;
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
