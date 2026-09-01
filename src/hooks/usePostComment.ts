import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { rebroadcastEvent } from '@/lib/rebroadcastEvent';
import { insertReplyIntoThreads } from '@/lib/insertReply';
import { NKinds, type NostrEvent } from '@nostrify/nostrify';
import { isNostrId } from '@/lib/nostrId';
import { nip22RefTag } from '@/lib/nostrEvents';

interface PostCommentParams {
  root: NostrEvent | URL | `#${string}`; // The root event to comment on
  reply?: NostrEvent | URL | `#${string}`; // Optional reply to another comment
  content: string;
  tags?: string[][]; // Additional tags (hashtags, mentions, imeta, etc.)
  /** Comment kind: 1111 (text, the default) or 1244 for a NIP-A0 voice comment. */
  kind?: number;
  /**
   * Pre-built uppercase root-scope tags, used verbatim instead of deriving them
   * from `root`. Set when replying to a NIP-22 comment: the parent already
   * carries the thread root, so its root scope is copied forward unchanged
   * rather than reconstructed. `root` is still used for cache/rebroadcast
   * bookkeeping.
   */
  rootTags?: string[][];
}

/**
 * Post a NIP-22 comment (kind 1111, or 1244 for voice) on an event.
 *
 * Ditto publishes every reply this way, kind 1 notes included — see the NIP-22
 * section of NIP.md for why it diverges from NIP-10 there.
 */
export function usePostComment() {
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ root, reply, content, tags: extraTags, rootTags, kind = 1111 }: PostCommentParams) => {
      // Extract hint maps from the reply event's existing tags, if available.
      const hints = extractHints(reply);
      const tags: string[][] = [];

      // Root event tags: copy the parent comment's root scope forward verbatim
      // when provided (see PostCommentParams.rootTags), otherwise derive it.
      if (rootTags?.length) {
        tags.push(...rootTags);
      } else {
        tags.push(...makeCommentTags('root', root, hints));
      }

      // Reply event tags
      if (reply) {
        tags.push(...makeCommentTags('reply', reply, hints));
      } else {
        // If this is a top-level comment, use the root event's tags
        tags.push(...makeCommentTags('reply', root, hints));
      }

      // Append any extra tags (hashtags, mentions, imeta, CW, etc.), skipping
      // NIP-21 mention `p` tags for pubkeys the reply scope already tags —
      // a duplicate `p` would make the parent author ambiguous to readers
      // that pick the tag by position.
      if (extraTags) {
        const tagged = new Set(tags.filter(([name]) => name === 'p').map(([, value]) => value));
        for (const tag of extraTags) {
          if (tag[0] === 'p' && tagged.has(tag[1])) continue;
          tags.push(tag);
        }
      }

      const event = await publishEvent({
        kind,
        content,
        tags,
      });

      // Rebroadcast the original event(s) alongside the comment (best-effort).
      // Only Nostr events (not URLs or NIP-73 identifiers) can be rebroadcast.
      if (reply && typeof reply !== 'string' && !(reply instanceof URL)) {
        rebroadcastEvent(nostr, reply);
      }
      if (typeof root !== 'string' && !(root instanceof URL)) {
        rebroadcastEvent(nostr, root);
      }

      return event;
    },
    onSuccess: (event, { root }) => {
      // Show the comment immediately instead of refetching, which would race
      // the relay's write→read indexing and come back without it.
      insertReplyIntoThreads(queryClient, event, root);
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
  } else if ((NKinds.replaceable(target.kind) || NKinds.addressable(target.kind)) && isNostrId(target.pubkey)) {
    // Only emit an addressable coordinate when the pubkey is a valid hex id.
    // A blank/invalid pubkey would produce a malformed `A` like "0::"; in that
    // case fall through to referencing the root by its event id instead.
    const d = target.tags.find(([name]) => name === 'd')?.[1] ?? '';
    const addr = `${target.kind}:${target.pubkey}:${NKinds.addressable(target.kind) ? d : ''}`;
    tags.push(nip22RefTag('A', addr, aHints.get(addr)?.[0]));
  } else {
    // NIP-22 puts the referenced event's author at position [3]. We know it
    // first-hand from the target itself; the hint map only fills in the relay
    // (and the author for targets the parent event referenced by id alone).
    const [relayHint, authorHint] = eHints.get(target.id) ?? [];
    const pubkey = isNostrId(target.pubkey) ? target.pubkey : authorHint;
    tags.push(nip22RefTag('E', target.id, relayHint, pubkey));
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
    // Skip a blank/invalid pubkey rather than emitting an empty `P` tag.
    if (isNostrId(target.pubkey)) {
      tags.push(['P', target.pubkey, ...pHints.get(target.pubkey) ?? []]);
    }
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
      const author = isNostrId(hints[1]) ? hints[1] : undefined;
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
