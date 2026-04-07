// src/blobbi/rooms/scene/hooks/useRoomSceneEditor.ts

/**
 * useRoomSceneEditor — Hook for editing and persisting room scene customization.
 *
 * Provides:
 *   - The current raw (unresolved) scene for the room
 *   - A `patch` function for partial, field-level updates
 *   - A `reset` function to remove customization (back to defaults)
 *   - `isSaving` state for UI feedback
 *
 * Persistence target (post-migration):
 *   - Reads and writes to kind 11127 (Blobbi House root event)
 *   - Uses fetchFreshEvent for safe read-modify-write
 *   - Uses patchHouseRoomScene for field-level partial updates
 *   - All sibling rooms, items, and unknown keys are preserved
 *   - Optimistic cache update via updateHouseEvent
 *
 * This hook is designed for the customization UI only (not for read-only rendering).
 * For rendering, use `useRoomScene` instead.
 */

import { useCallback, useMemo, useState } from 'react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { toast } from '@/hooks/useToast';
import {
  KIND_BLOBBI_HOUSE,
  buildHouseDTag,
  buildHouseTags,
} from '@/blobbi/house/lib/house-constants';
import {
  getRoomSceneFromHouse,
  patchHouseRoomScene,
  resetHouseRoomScene,
} from '@/blobbi/house/lib/house-content';
import { getDefaultRoomScene } from '@/blobbi/house/lib/house-defaults';
import type { HouseRoomScene } from '@/blobbi/house/lib/house-types';
import type { WallConfig, FloorConfig, RoomScene } from '../types';
import { DEFAULT_HOME_SCENE } from '../defaults';

/** Partial update shape accepted by the patch function. */
export interface RoomScenePatch {
  useThemeColors?: boolean;
  wall?: Partial<WallConfig>;
  floor?: Partial<FloorConfig>;
}

interface UseRoomSceneEditorResult {
  /** The current raw (unresolved) scene for this room. */
  scene: RoomScene;
  /** Apply a partial update to the room scene. Persists to kind 11127. */
  patchScene: (patch: RoomScenePatch) => Promise<void>;
  /** Reset the room to its default scene. Persists to kind 11127. */
  resetScene: () => Promise<void>;
  /** Whether a save operation is currently in flight. */
  isSaving: boolean;
}

export function useRoomSceneEditor(
  roomId: string,
  houseEvent: NostrEvent | null,
  updateHouseEvent: (event: NostrEvent) => void,
): UseRoomSceneEditorResult {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const [isSaving, setIsSaving] = useState(false);

  // The fallback scene for this room
  const fallbackScene = useMemo(
    (): HouseRoomScene => getDefaultRoomScene(roomId) ?? DEFAULT_HOME_SCENE,
    [roomId],
  );

  // Parse the current raw scene from house content
  const scene = useMemo((): RoomScene => {
    if (!houseEvent?.content) return fallbackScene;
    return getRoomSceneFromHouse(houseEvent.content, roomId) ?? fallbackScene;
  }, [houseEvent?.content, roomId, fallbackScene]);

  // ── Patch Scene ──
  const patchScene = useCallback(async (patch: RoomScenePatch) => {
    if (!user?.pubkey) return;

    setIsSaving(true);
    try {
      // Fetch fresh house event for safe read-modify-write
      const prev = await fetchFreshEvent(nostr, {
        kinds: [KIND_BLOBBI_HOUSE],
        authors: [user.pubkey],
        '#d': [buildHouseDTag(user.pubkey)],
      });

      const existingContent = prev?.content ?? houseEvent?.content ?? '';
      const existingTags = prev?.tags ?? buildHouseTags(user.pubkey);

      // Apply the partial patch to house content
      const updatedContent = patchHouseRoomScene(
        existingContent,
        roomId,
        patch,
        fallbackScene,
      );

      // Publish to kind 11127
      const event = await publishEvent({
        kind: KIND_BLOBBI_HOUSE,
        content: updatedContent,
        tags: existingTags,
        prev: prev ?? undefined,
      });

      // Optimistic cache update
      updateHouseEvent(event);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[useRoomSceneEditor] Failed to save room scene:', err);
      }
      toast({
        title: 'Failed to save',
        description: 'Room customization could not be saved. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [user?.pubkey, nostr, publishEvent, updateHouseEvent, roomId, fallbackScene, houseEvent?.content]);

  // ── Reset Scene ──
  const resetScene = useCallback(async () => {
    if (!user?.pubkey) return;

    setIsSaving(true);
    try {
      const prev = await fetchFreshEvent(nostr, {
        kinds: [KIND_BLOBBI_HOUSE],
        authors: [user.pubkey],
        '#d': [buildHouseDTag(user.pubkey)],
      });

      const existingContent = prev?.content ?? houseEvent?.content ?? '';
      const existingTags = prev?.tags ?? buildHouseTags(user.pubkey);

      // Reset this room's scene in house content
      const updatedContent = resetHouseRoomScene(existingContent, roomId);

      const event = await publishEvent({
        kind: KIND_BLOBBI_HOUSE,
        content: updatedContent,
        tags: existingTags,
        prev: prev ?? undefined,
      });

      updateHouseEvent(event);

      toast({
        title: 'Room reset',
        description: 'Room returned to default appearance.',
      });
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[useRoomSceneEditor] Failed to reset room scene:', err);
      }
      toast({
        title: 'Failed to reset',
        description: 'Could not reset room. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [user?.pubkey, nostr, publishEvent, updateHouseEvent, roomId, houseEvent?.content]);

  return { scene, patchScene, resetScene, isSaving };
}
