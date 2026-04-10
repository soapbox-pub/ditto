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
  type PoopInstance,
  XP_PER_POOP,
  generateInitialPoops,
  getPoopsInRoom,
  removePoop,
  hasAnyPoop,
} from './lib/poop-system';

export { RoomActionButton } from './components/RoomActionButton';
export { ItemCarousel, type CarouselEntry } from './components/ItemCarousel';
export { BlobbiRoomHero, type BlobbiRoomHeroProps } from './components/BlobbiRoomHero';
export { BlobbiRoomShell, type PoopState } from './components/BlobbiRoomShell';
