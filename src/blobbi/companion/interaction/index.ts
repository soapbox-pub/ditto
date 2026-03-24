/**
 * Companion Interaction Module
 * 
 * Provides the action menu and item interaction system for the Blobbi companion.
 * 
 * Components:
 * - CompanionActionMenu: Radial action buttons around Blobbi
 * - CompanionItemBubbles: Floating item display
 * 
 * Hooks:
 * - useCompanionActionMenu: Menu state management
 * - useClickDetection: Click vs drag detection
 * 
 * Future extensions:
 * - Item falling animation
 * - Drag items to Blobbi
 * - Blobbi reactions
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

// Hooks
export { useCompanionActionMenu } from './useCompanionActionMenu';
export { useClickDetection } from './useClickDetection';

// Components
export { CompanionActionMenu } from './CompanionActionMenu';
export { CompanionItemBubbles } from './CompanionItemBubbles';
