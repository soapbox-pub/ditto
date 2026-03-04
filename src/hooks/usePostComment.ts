import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { NKinds, type NostrEvent } from '@nostrify/nostrify';

interface PostCommentParams {
  root: NostrEvent | URL | `#${string}`; // The root event to comment on
  reply?: NostrEvent | URL | `#${string}`; // Optional reply to another comment
  content: string;
  tags?: string[][]; // Additional tags (hashtags, mentions, imeta, etc.)
}

/** Post a NIP-22 (kind 1111) comment on an event. */
export function usePostComment() {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ root, reply, content, tags: extraTags }: PostCommentParams) => {
      // Extract hint maps from the reply event's existing tags, if available.
      const hints = extractHints(reply);
      const tags: string[][] = [];

      // Root event tags
      tags.push(...makeCommentTags('root', root, hints));

      // Reply event tags
      if (reply) {
        tags.push(...makeCommentTags('reply', reply, hints));
      } else {
        // If this is a top-level comment, use the root event's tags
        tags.push(...makeCommentTags('reply', root, hints));
      }

      // Append any extra tags (hashtags, mentions, imeta, CW, etc.)
      if (extraTags) {
        tags.push(...extraTags);
      }

      const event = await publishEvent({
        kind: 1111,
        content,
        tags,
      });

      return event;
    },
    onSuccess: (_, { root }) => {
      const rootKey = root instanceof URL ? root.toString() : typeof root === 'string' ? root : root.id;

      // Invalidate and refetch comments
      queryClient.invalidateQueries({
        queryKey: ['nostr', 'comments', rootKey]
      });
    },
  });
}

/** Build NIP-22 comment tags for a given scope and target, enriched with hints when available. */
function makeCommentTags(scope: 'root' | 'reply', target: NostrEvent | URL | `#${string}`, hints: Hints): string[][] {
  const tags: string[][] = [];
  const { aHints, eHints, pHints } = hints;

  if (typeof target === 'string') {
    tags.push(['I', target]);
  } else if (target instanceof URL) {
    tags.push(['I', target.toString()]);
  } else if (NKinds.replaceable(target.kind) || NKinds.addressable(target.kind)) {
    const d = target.tags.find(([name]) => name === 'd')?.[1] ?? '';
    const addr = `${target.kind}:${target.pubkey}:${NKinds.addressable(target.kind) ? d : ''}`;
    tags.push(['A', addr, ...aHints.get(addr) ?? []]);
  } else {
    tags.push(['E', target.id, ...eHints.get(target.id) ?? []]);
  }
  if (typeof target === 'string') {
    tags.push(['K', '#']);
  } else if (target instanceof URL) {
    switch (target.protocol) {
      case 'http:':
      case 'https:':
        tags.push(['K', 'web']);
        break;
      default:
        tags.push(['K', target.protocol.replace(/:$/, '')]);
        break;
    }
  } else {
    tags.push(['K', target.kind.toString()]);
    tags.push(['P', target.pubkey, ...pHints.get(target.pubkey) ?? []]);
  }

  // Lowercase all tag names for reply scope
  if (scope === 'reply') {
    return tags.map(([name, ...values]) => [name.toLowerCase(), ...values]);
  }

  // Root scope: uppercase tags
  return tags;
}

interface Hints {
  /** Relay URL hints keyed by pubkey. */
  pHints: Map<string, string[]>;
  /** Relay URL and author hints keyed by event ID. */
  eHints: Map<string, string[]>;
  /** Relay URL hints keyed by addr (`kind:pubkey:d`). */
  aHints: Map<string, string[]>;
}

/** Extract relay/author hint maps from an event's tags (case-insensitive). */
function extractHints(target: NostrEvent | URL | `#${string}` | undefined): Hints {
  const pHints = new Map<string, string[]>();
  const eHints = new Map<string, string[]>();
  const aHints = new Map<string, string[]>();

  if (!isEvent(target)) {
    return { pHints, eHints, aHints };
  }

  for (const [name, value, ...hints] of target.tags) {
    const n = name?.toLowerCase();

    if (n === 'p') {
      try {
        const relayUrl = new URL(hints[0]);
        pHints.set(value, [relayUrl.href]);
      } catch {
        // Not a valid URL, ignore hints for this tag
      }
    } else if (n === 'a') {
      try {
        const relayUrl = new URL(hints[0]);
        aHints.set(value, [relayUrl.href]);
      } catch {
        // Not a valid URL, ignore hints for this tag
      }
    } else if (n === 'e') {
      const author = /^[0-9a-f]{64}$/.test(hints[1]) ? hints[1] : undefined;
      try {
        const relayUrl = new URL(hints[0]);
        eHints.set(value, [relayUrl.href, ...(author ? [author] : [])]);
      } catch {
        if (author) {
          eHints.set(value, ['', author]);
        }
      }
    }
  }

  return { pHints, eHints, aHints };
}

function isEvent(target: NostrEvent | URL | `#${string}` | undefined): target is NostrEvent {
  return !!target && typeof target !== 'string' && !(target instanceof URL);
}
