// src/blobbi/rooms/index.ts — barrel export

export {
  type BlobbiRoomId,
  type BlobbiRoomMeta,
  ROOM_META,
  DEFAULT_ROOM_ORDER,
  DEFAULT_INITIAL_ROOM,
  isValidRoomId,
  getNextRoom,
  getPreviousRoom,
  getRoomIndex,
} from './lib/room-config';

export { ROOM_BOTTOM_BAR_CLASS } from './lib/room-layout';

export {
  type RoomSurfaceLayout,
  type RoomLayout,
  type RoomLayoutsContent,
  DEFAULT_ROOM_LAYOUTS,
  parseRoomLayoutsContent,
  getEffectiveRoomLayout,
  ROOM_FLOOR_RATIO,
  getBlobbiBodyBottomInset,
} from './lib/room-layout-schema';

export {
  type FurnitureLayer,
  type FurnitureContent,
  type FurniturePlacement,
  type RoomFurnitureContent,
  FURNITURE_LAYERS,
  MAX_FURNITURE_PER_ROOM,
  parseRoomFurnitureContent,
} from './lib/room-furniture-schema';

export {
  type FurnitureDefinition,
  OFFICIAL_FURNITURE,
  resolveFurniture,
  getFurnitureAsset,
  canPlaceInRoom,
  getAvailableFurnitureForRoom,
} from './lib/furniture-registry';

export { DEFAULT_ROOM_FURNITURE } from './lib/room-furniture-defaults';
export { getEffectiveRoomFurniture } from './lib/room-furniture-effective';

export { getSurfaceBackground } from './lib/room-surface-background';

export { BlobbiRoomEditor, BlobbiRoomEditorTrigger } from './components/BlobbiRoomEditor';

export {
  type PoopInstance,
  XP_PER_POOP,
  OVERFEED_THRESHOLD,
  OVERFEED_CHANCE,
  generateInitialPoops,
  addPoop,
  getPoopsInRoom,
  removePoop,
  hasAnyPoop,
} from './lib/poop-system';

export { RoomActionButton } from './components/RoomActionButton';
export { RoomFurnitureLayer } from './components/RoomFurnitureLayer';
export { RoomFurnitureEditor, RoomFurnitureEditorTrigger } from './components/RoomFurnitureEditor';
export { ItemCarousel, type CarouselEntry } from './components/ItemCarousel';
export { BlobbiRoomHero, type BlobbiRoomHeroProps } from './components/BlobbiRoomHero';
export { BlobbiRoomShell, type PoopState } from './components/BlobbiRoomShell';
export { BlobbiRoomStage, type BlobbiRoomStageProps } from './components/BlobbiRoomStage';
export { BlobbiRoomStatusHud, type BlobbiRoomStatusHudProps } from './components/BlobbiRoomStatusHud';
export { useShovelDrag, type ShovelDrag } from './hooks/useShovelDrag';
export { PoopOverlay, InteractivePoopOverlay, ShovelButton } from './components/RoomPoopLayer';
