// src/blobbi/house/items/index.ts — barrel export

export { RoomItemsLayer } from './RoomItemsLayer';
export { BuiltinItemVisual } from './BuiltinItemVisual';
export { BUILTIN_ITEMS, getCatalogItem, type CatalogItem } from './item-catalog';
export {
  toScreenPosition,
  toWallPosition,
  toFloorPosition,
  toScreenSize,
  type ScreenPosition,
} from './item-coordinates';
