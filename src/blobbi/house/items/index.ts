// src/blobbi/house/items/index.ts — barrel export

export { RoomItemsLayer, type RoomItemsEditCallbacks } from './RoomItemsLayer';
export { BuiltinItemVisual } from './BuiltinItemVisual';
export { AddItemSheet } from './AddItemSheet';
export { BUILTIN_ITEMS, getCatalogItem, type CatalogItem } from './item-catalog';
export {
  toScreenPosition,
  toWallPosition,
  toFloorPosition,
  toScreenSize,
  wallPixelDeltaToNormalized,
  floorPixelDeltaToNormalized,
  clampNormalized,
  type ScreenPosition,
} from './item-coordinates';
