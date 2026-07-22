import { useCallback } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { downloadBinaryFile } from '@/lib/downloadFile';
import {
  MEMORY_CARD_KIND,
  blockBytes,
  buildBlockTags,
  bytesToHex,
  parseCardImage,
  reTagBlock,
  reconstructCard,
} from '@/lib/memorycard';

/**
 * Simple management actions for memory cards. Downloads are local and always
 * available; copy/clone publish new kind-38192 events under the current user's
 * key and require a logged-in signer (`canManage`).
 */
export function useMemoryCardActions() {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

  /** Re-publish one block under the user's key at a target card id + index. */
  const publishBlock = useCallback(
    async (source: NostrEvent, targetCardId: string, targetBlock: number) => {
      await publishEvent({
        kind: MEMORY_CARD_KIND,
        content: source.content,
        tags: reTagBlock(source, targetCardId, targetBlock),
      });
    },
    [publishEvent],
  );

  /** Re-publish every in-use block of a card under the user's key. */
  const cloneCard = useCallback(
    async (blocks: Record<number, NostrEvent>, targetCardId: string) => {
      const nums = Object.keys(blocks)
        .map(Number)
        .sort((a, b) => a - b);
      for (const n of nums) {
        await publishEvent({
          kind: MEMORY_CARD_KIND,
          content: blocks[n].content,
          tags: reTagBlock(blocks[n], targetCardId, n),
        });
      }
      return nums.length;
    },
    [publishEvent],
  );

  /**
   * Publish (or update) a card from a raw memory-card image. Splits the image
   * into blocks, publishes the header (block 0) plus every occupied save block
   * under the given card id, and returns the number of blocks published. The
   * signer prompts once per block. Publishing to an existing card id overwrites
   * its blocks (last-writer-wins).
   */
  const uploadCard = useCallback(
    async (cardId: string, image: Uint8Array, name?: string) => {
      const parsed = parseCardImage(image);
      if (!parsed) {
        throw new Error('Not a valid PlayStation memory card image (needs a 128 KB "MC" header).');
      }

      const trimmedName = name?.trim() || undefined;

      // Header (block 0) first, so a reconstructed .mcd has its directory.
      await publishEvent({
        kind: MEMORY_CARD_KIND,
        content: bytesToHex(parsed.header),
        tags: buildBlockTags(cardId, 0, parsed.header, { state: 'header', name: trimmedName }),
      });

      for (const b of parsed.blocks) {
        await publishEvent({
          kind: MEMORY_CARD_KIND,
          content: bytesToHex(b.bytes),
          tags: buildBlockTags(cardId, b.index, b.bytes, {
            state: b.state,
            name: trimmedName,
            filename: b.filename,
            region: b.region,
            title: b.title,
          }),
        });
      }

      return parsed.blocks.length + 1; // + header
    },
    [publishEvent],
  );

  /** Reconstruct and download the full 128 KB `.mcd` image. */
  const downloadCard = useCallback(
    async (cardId: string, blocks: Record<number, NostrEvent>) => {
      const { image, present, hasHeader } = reconstructCard(blocks);
      await downloadBinaryFile(`${cardId}.mcd`, image);
      return { present, hasHeader };
    },
    [],
  );

  /** Download a single block's raw 8 KB `.bin`. */
  const downloadBlock = useCallback(
    async (cardId: string, index: number, event: NostrEvent) => {
      const bytes = blockBytes(event);
      if (!bytes) throw new Error(`Block #${index} is not ${8192} bytes`);
      await downloadBinaryFile(`${cardId}-block${index}.bin`, bytes);
    },
    [],
  );

  return {
    canManage: !!user,
    myPubkey: user?.pubkey,
    publishBlock,
    cloneCard,
    uploadCard,
    downloadCard,
    downloadBlock,
  };
}
