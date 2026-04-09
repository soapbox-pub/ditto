// src/blobbi/house/hooks/useRoomItemEditor.ts

/**
 * useRoomItemEditor — Manages furniture edit mode and persists item
 * position changes to kind 11127.
 *
 * ── Responsibilities ─────────────────────────────────────────────────
 *
 *   1. Toggle edit mode on/off
 *   2. Track the currently selected item (instanceId)
 *   3. Persist position changes via fetchFreshEvent + updateRoomItemPosition
 *   4. Optimistic cache update via updateHouseEvent
 *
 * ── Design constraints ───────────────────────────────────────────────
 *
 *   - Only one item selected at a time (no multi-select)
 *   - Publish happens once on drag-end, not on every movement
 *   - Uses the same fetchFreshEvent → patch → publish → optimistic
 *     cache pattern as useRoomSceneEditor
 *   - The hook is intentionally room-agnostic (receives roomId),
 *     but for now is only used in the home room
 */

import { useCallback, useState } from 'react';
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
} from '../lib/house-constants';
import { updateRoomItemPosition } from '../lib/house-content';
import type { HouseItemPosition } from '../lib/house-types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseRoomItemEditorResult {
  /** Whether edit mode is active. */
  editMode: boolean;
  /** Toggle edit mode. Clears selection when exiting. */
  setEditMode: (on: boolean) => void;
  /** The instanceId of the selected item, or null. */
  selectedItemId: string | null;
  /** Select an item by instanceId. Pass null to deselect. */
  selectItem: (instanceId: string | null) => void;
  /** Persist a new position for an item. Called on drag-end. */
  commitPosition: (instanceId: string, position: HouseItemPosition) => Promise<void>;
  /** Whether a save/publish is in flight. */
  isSaving: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRoomItemEditor(
  roomId: string,
  houseEvent: NostrEvent | null,
  updateHouseEvent: (event: NostrEvent) => void,
): UseRoomItemEditorResult {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

  const [editMode, setEditModeRaw] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // ── Toggle edit mode ──
  const setEditMode = useCallback((on: boolean) => {
    setEditModeRaw(on);
    if (!on) {
      setSelectedItemId(null);
    }
  }, []);

  // ── Select an item ──
  const selectItem = useCallback((instanceId: string | null) => {
    setSelectedItemId(instanceId);
  }, []);

  // ── Persist position ──
  const commitPosition = useCallback(async (
    instanceId: string,
    position: HouseItemPosition,
  ) => {
    if (!user?.pubkey) return;

    setIsSaving(true);
    try {
      // Fetch fresh event for safe read-modify-write
      const prev = await fetchFreshEvent(nostr, {
        kinds: [KIND_BLOBBI_HOUSE],
        authors: [user.pubkey],
        '#d': [buildHouseDTag(user.pubkey)],
      });

      const existingContent = prev?.content ?? houseEvent?.content ?? '';
      const existingTags = prev?.tags ?? buildHouseTags(user.pubkey);

      // Patch the single item's position in house content
      const updatedContent = updateRoomItemPosition(
        existingContent,
        roomId,
        instanceId,
        position,
      );

      // If nothing changed (item or room not found), bail
      if (updatedContent === existingContent) return;

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
        console.error('[useRoomItemEditor] Failed to save item position:', err);
      }
      toast({
        title: 'Failed to save',
        description: 'Item position could not be saved. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [user?.pubkey, nostr, publishEvent, updateHouseEvent, roomId, houseEvent?.content]);

  return {
    editMode,
    setEditMode,
    selectedItemId,
    selectItem,
    commitPosition,
    isSaving,
  };
}
