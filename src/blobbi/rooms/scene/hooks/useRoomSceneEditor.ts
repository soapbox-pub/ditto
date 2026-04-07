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
 * Persistence strategy:
 *   - Uses fetchFreshEvent to get the latest kind 11125 event (safe read-modify-write)
 *   - Uses patchRoomSceneContent for field-level partial updates
 *   - All sibling content sections are preserved
 *   - Optimistic cache update via updateProfileEvent
 *
 * This hook is designed for the customization UI only (not for read-only rendering).
 * For rendering, use `useRoomScene` instead.
 */

import { useCallback, useMemo, useState } from 'react';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { toast } from '@/hooks/useToast';
import {
  KIND_BLOBBONAUT_PROFILE,
  type BlobbonautProfile,
} from '@/blobbi/core/lib/blobbi';
import type { BlobbiRoomId } from '../../lib/room-config';
import type { RoomScene, WallConfig, FloorConfig } from '../types';
import { getDefaultScene, DEFAULT_HOME_SCENE } from '../defaults';
import { parseRoomCustomization, patchRoomSceneContent, removeRoomSceneContent } from '../lib/room-scene-content';

/** Partial update shape accepted by the patch function. */
export interface RoomScenePatch {
  useThemeColors?: boolean;
  wall?: Partial<WallConfig>;
  floor?: Partial<FloorConfig>;
}

interface UseRoomSceneEditorResult {
  /** The current raw (unresolved) scene for this room. */
  scene: RoomScene;
  /** Apply a partial update to the room scene. Persists to kind 11125. */
  patchScene: (patch: RoomScenePatch) => Promise<void>;
  /** Reset the room to its default scene. Removes from kind 11125. */
  resetScene: () => Promise<void>;
  /** Whether a save operation is currently in flight. */
  isSaving: boolean;
}

export function useRoomSceneEditor(
  roomId: BlobbiRoomId,
  profile: BlobbonautProfile | null,
  updateProfileEvent: (event: import('@nostrify/nostrify').NostrEvent) => void,
): UseRoomSceneEditorResult {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const [isSaving, setIsSaving] = useState(false);

  // The fallback scene for this room
  const fallbackScene = useMemo(
    () => getDefaultScene(roomId) ?? DEFAULT_HOME_SCENE,
    [roomId],
  );

  // Parse the current raw scene from profile content
  const scene = useMemo(() => {
    if (!profile?.event?.content) return fallbackScene;
    const map = parseRoomCustomization(profile.event.content);
    return map?.[roomId] ?? fallbackScene;
  }, [profile?.event?.content, roomId, fallbackScene]);

  // ── Patch Scene ──
  const patchScene = useCallback(async (patch: RoomScenePatch) => {
    if (!user?.pubkey || !profile) return;

    setIsSaving(true);
    try {
      // Fetch fresh event for safe read-modify-write
      const prev = await fetchFreshEvent(nostr, {
        kinds: [KIND_BLOBBONAUT_PROFILE],
        authors: [user.pubkey],
      });

      const existingContent = prev?.content ?? profile.event.content ?? '';
      const existingTags = prev?.tags ?? profile.allTags;

      // Apply the partial patch
      const updatedContent = patchRoomSceneContent(
        existingContent,
        roomId,
        patch,
        fallbackScene,
      );

      // Publish
      const event = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content: updatedContent,
        tags: existingTags,
        prev: prev ?? undefined,
      });

      // Optimistic cache update
      updateProfileEvent(event);
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
  }, [user?.pubkey, profile, nostr, publishEvent, updateProfileEvent, roomId, fallbackScene]);

  // ── Reset Scene ──
  const resetScene = useCallback(async () => {
    if (!user?.pubkey || !profile) return;

    setIsSaving(true);
    try {
      const prev = await fetchFreshEvent(nostr, {
        kinds: [KIND_BLOBBONAUT_PROFILE],
        authors: [user.pubkey],
      });

      const existingContent = prev?.content ?? profile.event.content ?? '';
      const existingTags = prev?.tags ?? profile.allTags;

      // Remove this room's scene
      const updatedContent = removeRoomSceneContent(existingContent, roomId);

      const event = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content: updatedContent,
        tags: existingTags,
        prev: prev ?? undefined,
      });

      updateProfileEvent(event);

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
  }, [user?.pubkey, profile, nostr, publishEvent, updateProfileEvent, roomId]);

  return { scene, patchScene, resetScene, isSaving };
}
