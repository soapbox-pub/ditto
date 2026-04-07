// src/blobbi/rooms/scene/hooks/useRoomScene.ts

/**
 * useRoomScene — Hook that resolves the active room scene for a given room.
 *
 * Data flow (post-migration to kind 11127):
 *   1. Read room scene from the house event content (kind 11127)
 *   2. Fall back to default scene if room not found
 *   3. If `useThemeColors` is true, resolve colors from the active app theme
 *   4. Return the fully resolved scene, ready for rendering
 *
 * The hook is memoized to avoid unnecessary re-renders. It only recomputes
 * when the house content, room ID, or theme config changes.
 */

import { useMemo } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { getRoomSceneFromHouse } from '@/blobbi/house';
import { getDefaultRoomScene } from '@/blobbi/house/lib/house-defaults';
import type { ResolvedRoomScene, RoomScene } from '../types';
import { DEFAULT_HOME_SCENE } from '../defaults';
import { getActiveThemeColors, resolveRoomScene } from '../resolver';

/**
 * Resolve the active room scene for a given room.
 *
 * @param roomId           - The room to get the scene for
 * @param houseContent     - The raw kind 11127 house event content string (or empty)
 * @returns The fully resolved scene with concrete colors
 */
export function useRoomScene(
  roomId: string,
  houseContent: string,
): ResolvedRoomScene {
  const { config } = useAppContext();

  // Get the scene for this room from house content → default → ultimate fallback
  const scene = useMemo((): RoomScene => {
    const fromHouse = getRoomSceneFromHouse(houseContent, roomId);
    if (fromHouse) return fromHouse;
    const defaultScene = getDefaultRoomScene(roomId);
    if (defaultScene) return defaultScene;
    return DEFAULT_HOME_SCENE;
  }, [houseContent, roomId]);

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
