// src/blobbi/rooms/index.ts — barrel export

export {
  type BlobbiRoomId,
  type BlobbiRoomMeta,
  ROOM_META,
  DEFAULT_ROOM_ORDER,
  DEFAULT_INITIAL_ROOM,
  getNextRoom,
  getPreviousRoom,
  getRoomIndex,
} from './lib/room-config';

export { BlobbiRoomShell } from './components/BlobbiRoomShell';
export { BlobbiHomeRoom } from './components/BlobbiHomeRoom';
export { BlobbiKitchenRoom } from './components/BlobbiKitchenRoom';
export { BlobbiCareRoom } from './components/BlobbiCareRoom';
export { BlobbiHatcheryRoom } from './components/BlobbiHatcheryRoom';
export { BlobbiRestRoom } from './components/BlobbiRestRoom';
export { BlobbiClosetRoom } from './components/BlobbiClosetRoom';
