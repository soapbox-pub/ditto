// src/blobbi/rooms/scene/hooks/useRoomScene.ts

/**
 * useRoomScene — Hook that resolves the active room scene for a given room.
 *
 * Data flow:
 *   1. Read persisted `roomCustomization` from the profile event content
 *   2. Look up the scene for the requested room ID (fallback to default)
 *   3. If `useThemeColors` is true, resolve colors from the active app theme
 *   4. Return the fully resolved scene, ready for rendering
 *
 * The hook is memoized to avoid unnecessary re-renders. It only recomputes
 * when the profile content, room ID, or theme config changes.
 */

import { useMemo } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import type { BlobbiRoomId } from '../../lib/room-config';
import type { ResolvedRoomScene } from '../types';
import { getDefaultScene } from '../defaults';
import { DEFAULT_HOME_SCENE } from '../defaults';
import { parseRoomCustomization } from '../lib/room-scene-content';
import { getActiveThemeColors, resolveRoomScene } from '../resolver';

/**
 * Resolve the active room scene for a given room.
 *
 * @param roomId       - The room to get the scene for
 * @param eventContent - The raw kind 11125 event content string (or empty)
 * @returns The fully resolved scene with concrete colors
 */
export function useRoomScene(
  roomId: BlobbiRoomId,
  eventContent: string,
): ResolvedRoomScene {
  const { config } = useAppContext();

  // Parse persisted room customization from content
  const customization = useMemo(
    () => parseRoomCustomization(eventContent),
    [eventContent],
  );

  // Get the scene for this room: persisted → default → ultimate fallback
  const scene = useMemo(
    () => customization?.[roomId] ?? getDefaultScene(roomId) ?? DEFAULT_HOME_SCENE,
    [customization, roomId],
  );

  // Get current theme colors for potential theme-based resolution
  const themeColors = useMemo(
    () => getActiveThemeColors(config),
    // Only the fields that affect color resolution
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.theme, config.customTheme?.colors, config.themes],
  );

  // Resolve final colors (applies theme if enabled)
  const resolved = useMemo(
    () => resolveRoomScene(scene, themeColors),
    [scene, themeColors],
  );

  return resolved;
}
