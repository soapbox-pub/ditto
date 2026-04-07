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

// ── Persistence ──
export {
  parseRoomCustomization,
  updateRoomSceneContent,
  removeRoomSceneContent,
} from './lib/room-scene-content';

// ── Hook ──
export { useRoomScene } from './hooks/useRoomScene';

// ── Components ──
export { RoomSceneLayer } from './components/RoomSceneLayer';
export { WallLayer } from './components/WallLayer';
export { FloorLayer } from './components/FloorLayer';
