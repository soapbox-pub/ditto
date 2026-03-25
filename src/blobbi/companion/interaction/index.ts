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

// Hooks
export { useCompanionActionMenu } from './useCompanionActionMenu';
export { useClickDetection } from './useClickDetection';
export { useCompanionItemUse } from './useCompanionItemUse';

// Context
export {
  BlobbiActionsContext,
  BlobbiActionsProvider,
  useBlobbiActions,
  useBlobbiActionsRegistration,
} from './BlobbiActionsContext';

// Components
export { CompanionActionMenu } from './CompanionActionMenu';
export { HangingItems } from './HangingItems';
