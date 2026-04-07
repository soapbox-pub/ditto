// src/blobbi/house/index.ts — barrel export

// ── Constants ──
export {
  KIND_BLOBBI_HOUSE,
  HOUSE_SCHEMA,
  HOUSE_VERSION,
  HOUSE_DEFAULT_NAME,
  buildHouseDTag,
  buildHouseTags,
} from './lib/house-constants';

// ── Types ──
export type {
  HouseItemKind,
  HouseItemPlane,
  HouseItemLayer,
  HouseItemPosition,
  HouseItem,
  HouseRoomScene,
  HouseRoom,
  HouseLayout,
  HouseMeta,
  BlobbiHouseContent,
} from './lib/house-types';

// ── Defaults ──
export {
  DEFAULT_ROOMS,
  DEFAULT_ROOM_ORDER,
  buildDefaultHouseContent,
  getDefaultRoomScene,
} from './lib/house-defaults';

// ── Content Helpers ──
export {
  parseHouseContent,
  updateHouseRoomScene,
  patchHouseRoomScene,
  resetHouseRoomScene,
  getRoomSceneFromHouse,
} from './lib/house-content';

// ── Migration ──
export {
  extractLegacyRoomCustomization,
  buildHouseWithLegacyData,
  resolveHouseBootstrap,
} from './lib/house-migration';

// ── Hooks ──
export { useBlobbiHouse, type UseBlobbiHouseResult } from './hooks/useBlobbiHouse';
