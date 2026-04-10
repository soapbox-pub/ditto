/**
 * Companion Interaction Module
 * 
 * Provides the action menu and item interaction system for the Blobbi companion.
 * 
 * Components:
 * - CompanionActionMenu: Radial action buttons around Blobbi
 * - HangingItems: Items displayed as hanging elements from the top of screen
 * 
 * Hooks:
 * - useCompanionActionMenu: Menu state management
 * - useClickDetection: Click vs drag detection
 * - useCompanionItemUse: Item use with success/failure handling
 * 
 * Context:
 * - BlobbiActionsContext: Provides item use functionality from parent
 * 
 * Future extensions:
 * - Drag items to Blobbi
 * - Blobbi reactions to items
 * - Auto-use urgent items
 */

// Types
export type {
  CompanionMenuAction,
  MenuActionConfig,
  CompanionItem,
  CompanionMenuState,
  ClickDetectionConfig,
} from './types';

// HangingItems types
export type { ItemLandedData } from './HangingItems';

export {
  MENU_ACTIONS,
  INITIAL_MENU_STATE,
  DEFAULT_CLICK_CONFIG,
  getMenuActionConfig,
  getItemCategoryForAction,
} from './types';

// Item use types
export type {
  ItemUseResult,
  UseItemCallback,
  UseCompanionItemUseOptions,
  UseCompanionItemUseResult,
} from './useCompanionItemUse';

export {
  CATEGORY_TO_ACTION,
  MENU_ACTION_TO_INVENTORY_ACTION,
} from './useCompanionItemUse';

// Actions context types
export type {
  UseItemResult as ContextUseItemResult,
  UseItemFunction,
  BlobbiActionsContextValue,
} from './BlobbiActionsContext';

// Shared item use hook types
export type {
  UseBlobbiItemUseOptions,
  UseBlobbiItemUseResult,
} from './useBlobbiItemUse';

// Hooks
export { useCompanionActionMenu } from './useCompanionActionMenu';
export { useClickDetection } from './useClickDetection';
export { useCompanionItemUse } from './useCompanionItemUse';
export { useBlobbiItemUse } from './useBlobbiItemUse';

// Context
export {
  BlobbiActionsContext,
  useBlobbiActions,
  useBlobbiActionsRegistration,
} from './BlobbiActionsContext';
export { BlobbiActionsProvider } from './BlobbiActionsProvider';

// Components
export { CompanionActionMenu } from './CompanionActionMenu';
export { HangingItems } from './HangingItems';

// Need Detection
export {
  NEED_THRESHOLDS,
  checkStatNeed,
  checkItemCategoryNeed,
  getAllNeeds,
  hasCriticalNeed,
  hasAnyNeed,
} from './needDetection';

export type {
  NeedPriority,
  NeedCheckResult,
} from './needDetection';
