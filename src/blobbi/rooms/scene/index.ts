// src/blobbi/rooms/scene/index.ts — barrel export

// ── Types ──
export type {
  WallType,
  FloorType,
  WallConfig,
  FloorConfig,
  RoomScene,
  ResolvedRoomScene,
  RoomCustomizationMap,
} from './types';

// ── Defaults ──
export { DEFAULT_HOME_SCENE, DEFAULT_ROOM_SCENES, getDefaultScene } from './defaults';

// ── Resolver ──
export { resolveRoomScene, getActiveThemeColors } from './resolver';

// ── Legacy Persistence (kind 11125) ──
// ⚠️  These helpers are for reading legacy `roomCustomization` data only.
// New code should use house content helpers from `@/blobbi/house`.
export {
  parseRoomCustomization,
  updateRoomSceneContent,
  patchRoomSceneContent,
  removeRoomSceneContent,
} from './lib/room-scene-content';

// ── Hooks ──
export { useRoomScene } from './hooks/useRoomScene';
export { useRoomSceneEditor, type RoomScenePatch } from './hooks/useRoomSceneEditor';

// ── Layout Constants ──
export {
  WALL_PERCENT,
  FLOOR_PERSPECTIVE,
  FLOOR_TILT,
  FLOOR_OVERFLOW,
} from './components/RoomSceneLayer';

// ── Components ──
export { RoomSceneLayer } from './components/RoomSceneLayer';
export { WallLayer } from './components/WallLayer';
export { FloorLayer } from './components/FloorLayer';
export { RoomCustomizeSheet } from './components/RoomCustomizeSheet';
