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
      const tags: string[][] = [];

      // Root event tags
      tags.push(...makeCommentTags('root', root));

      // Reply event tags
      if (reply) {
        tags.push(...makeCommentTags('reply', reply));
      } else {
        // If this is a top-level comment, use the root event's tags
        tags.push(...makeCommentTags('reply', root));
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

/** Build NIP-22 comment tags for a given scope and target */
function makeCommentTags(scope: 'root' | 'reply', target: NostrEvent | URL | `#${string}`): string[][] {
  const tags: string[][] = [];

  const d = (typeof target === 'string' || target instanceof URL)
    ? ''
    : target.tags.find(([name]) => name === 'd')?.[1] ?? '';

  if (typeof target === 'string') {
    tags.push(['I', target]);
  } else if (target instanceof URL) {
    tags.push(['I', target.toString()]);
  } else if (NKinds.addressable(target.kind)) {
    tags.push(['A', `${target.kind}:${target.pubkey}:${d}`]);
  } else if (NKinds.replaceable(target.kind)) {
    tags.push(['A', `${target.kind}:${target.pubkey}:`]);
  } else {
    tags.push(['E', target.id]);
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
    tags.push(['P', target.pubkey]);
  }

  // Lowercase all tag names for reply scope
  if (scope === 'reply') {
    return tags.map(([name, ...values]) => [name.toLowerCase(), ...values]);
  }

  // Root scope: uppercase tags
  return tags;
}
