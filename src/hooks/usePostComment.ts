import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { NKinds, type NostrEvent } from '@nostrify/nostrify';

interface PostCommentParams {
  root: NostrEvent | URL; // The root event to comment on
  reply?: NostrEvent | URL; // Optional reply to another comment
  content: string;
}

/** Post a NIP-22 (kind 1111) comment on an event. */
export function usePostComment() {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ root, reply, content }: PostCommentParams) => {
      const tags: string[][] = [];

      // d-tag identifiers
      const dRoot = root instanceof URL ? '' : root.tags.find(([name]) => name === 'd')?.[1] ?? '';
      const dReply = reply instanceof URL ? '' : reply?.tags.find(([name]) => name === 'd')?.[1] ?? '';

      // Root event tags
      if (root instanceof URL) {
        tags.push(['I', root.toString()]);
      } else if (NKinds.addressable(root.kind)) {
        tags.push(['A', `${root.kind}:${root.pubkey}:${dRoot}`]);
      } else if (NKinds.replaceable(root.kind)) {
        tags.push(['A', `${root.kind}:${root.pubkey}:`]);
      } else {
        tags.push(['E', root.id]);
      }
      if (root instanceof URL) {
        tags.push(['K', root.hostname]);
      } else {
        tags.push(['K', root.kind.toString()]);
        tags.push(['P', root.pubkey]);
      }

      // Reply event tags
      if (reply) {
        if (reply instanceof URL) {
          tags.push(['i', reply.toString()]);
        } else if (NKinds.addressable(reply.kind)) {
          tags.push(['a', `${reply.kind}:${reply.pubkey}:${dReply}`]);
        } else if (NKinds.replaceable(reply.kind)) {
          tags.push(['a', `${reply.kind}:${reply.pubkey}:`]);
        } else {
          tags.push(['e', reply.id]);
        }
        if (reply instanceof URL) {
          tags.push(['k', reply.hostname]);
        } else {
          tags.push(['k', reply.kind.toString()]);
          tags.push(['p', reply.pubkey]);
        }
      } else {
        // If this is a top-level comment, use the root event's tags
        if (root instanceof URL) {
          tags.push(['i', root.toString()]);
        } else if (NKinds.addressable(root.kind)) {
          tags.push(['a', `${root.kind}:${root.pubkey}:${dRoot}`]);
        } else if (NKinds.replaceable(root.kind)) {
          tags.push(['a', `${root.kind}:${root.pubkey}:`]);
        } else {
          tags.push(['e', root.id]);
        }
        if (root instanceof URL) {
          tags.push(['k', root.hostname]);
        } else {
          tags.push(['k', root.kind.toString()]);
          tags.push(['p', root.pubkey]);
        }
      }

      const event = await publishEvent({
        kind: 1111,
        content,
        tags,
      });

      return event;
    },
    onSuccess: (_, { root }) => {
      // Invalidate and refetch comments
      queryClient.invalidateQueries({
        queryKey: ['nostr', 'comments', root instanceof URL ? root.toString() : root.id]
      });
    },
  });
}