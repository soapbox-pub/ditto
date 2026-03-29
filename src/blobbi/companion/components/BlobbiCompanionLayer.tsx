/**
 * BlobbiCompanionLayer
 * 
 * Global layer component that renders the companion above all other content.
 * This should be placed at the root level of the app.
 * 
 * Entry animations are VERTICAL based on sidebar navigation direction:
 * - Navigating DOWN the sidebar: Blobbi falls from the top of the screen
 * - Navigating UP the sidebar: Blobbi rises from the bottom with inspection
 * 
 * Interaction features:
 * - Click/tap on Blobbi opens action menu
 * - Action menu shows available actions in a radial layout
 * - Selecting an action shows available items as floating bubbles
 */

import { useCallback, useState, useMemo } from 'react';

import { useBlobbiCompanion } from '../hooks/useBlobbiCompanion';
import { useCompanionItemReaction } from '../hooks/useCompanionItemReaction';
import { BlobbiCompanion } from './BlobbiCompanion';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';
import { calculateGroundY } from '../utils/movement';
import { useStatusReaction } from '@/blobbi/ui/hooks/useStatusReaction';
import { getActionEmotion, type ActionType } from '@/blobbi/ui/lib/status-reactions';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotions';
import {
  useCompanionActionMenu,
  useBlobbiActions,
  CompanionActionMenu,
  HangingItems,
  CATEGORY_TO_ACTION,
  type CompanionItem,
  type ItemLandedData,
} from '../interaction';
import type { Position } from '../types/companion.types';

// DEBUG MODE - Set to true to debug ground contact
const DEBUG_GROUND_CONTACT = false;

/**
 * Global companion layer.
 * 
 * Renders the companion if:
 * - User is logged in
 * - User has set a current_companion in their profile
 * - The companion data is loaded
 * 
 * Entry animations are vertical:
 * - Falls from top when navigating DOWN the sidebar
 * - Rises from bottom (with inspection) when navigating UP the sidebar
 */
export function BlobbiCompanionLayer() {
  const {
    companion,
    isVisible,
    state,
    motion,
    eyeOffset,
    isEntering,
    entryProgress,
    entryState,
    wasResolvedFromStuck,
    groundPosition,
    viewport,
    startDrag,
    updateDrag,
    endDrag,
    triggerAttention,
  } = useBlobbiCompanion();
  
  const config = DEFAULT_COMPANION_CONFIG;
  
  // Track the actual rendered position of the companion
  // This accounts for entry animations, float offset, etc.
  const [renderedPosition, setRenderedPosition] = useState<Position>(motion.position);
  
  // Handle position updates from BlobbiCompanion
  const handlePositionUpdate = useCallback((position: Position) => {
    setRenderedPosition(position);
  }, []);
  
  // Callback for glancing at items (when Blobbi doesn't need them)
  const handleGlanceAtItem = useCallback((position: Position) => {
    triggerAttention(position, {
      duration: 800,
      priority: 'low',
      source: 'item-landed:glance',
      isGlance: true,
    });
  }, [triggerAttention]);
  
  // Callback for walking to items (when Blobbi needs them)
  // For now, we just glance more intensely - full walking behavior 
  // would require deeper integration with the state machine
  const handleWalkToItem = useCallback((position: Position) => {
    // TODO: Implement actual walking behavior via useBlobbiCompanionState
    // For now, trigger a longer attention to simulate interest
    triggerAttention(position, {
      duration: 1500,
      priority: 'normal',
      source: 'item-landed:need',
      isGlance: false, // Use longer cooldown for "interested" attention
    });
  }, [triggerAttention]);
  
  // Item reaction hook - determines if Blobbi needs items and how to react
  const { reactToItemLanding } = useCompanionItemReaction({
    isActive: isVisible && !isEntering,
    onGlance: handleGlanceAtItem,
    onWalkTo: handleWalkToItem,
  });
  
  // Handle when an item finishes falling and lands on the ground
  const handleItemLanded = useCallback((data: ItemLandedData) => {
    if (import.meta.env.DEV) {
      console.log('[CompanionLayer] Item landed:', data.item.name, 'at', { x: data.x, y: data.y });
    }
    
    // React to the item landing based on Blobbi's needs
    reactToItemLanding(data.item.category, { x: data.x, y: data.y });
  }, [reactToItemLanding]);
  
  // Action menu state
  const {
    menuState,
    availableActions,
    toggleMenu,
    closeMenu,
    selectAction,
    handleItemClick,
  } = useCompanionActionMenu({
    isActive: isVisible,
    stage: companion?.stage,
    onItemClick: (item) => {
      // Item was clicked in the hanging menu - this releases it
      console.log('[CompanionLayer] Item released:', item);
    },
  });
  
  // Get Blobbi actions from context
  // This now works even when BlobbiPage is not mounted (uses built-in fallback)
  const { 
    useItem: contextUseItem, 
    canUseItems, 
    isItemOnCooldown 
  } = useBlobbiActions();
  
  /**
   * Handle item use - called when item contacts Blobbi or is clicked.
   * Uses the BlobbiActionsContext to perform the actual item use.
   * Returns success/failure to control whether item is removed from screen.
   * 
   * Now works from any page (not just /blobbi) thanks to the built-in
   * fallback in BlobbiActionsContext.
   */
  const handleItemUse = useCallback(async (item: CompanionItem): Promise<{ success: boolean; error?: string }> => {
    // Resolve the action from the item category
    const action = CATEGORY_TO_ACTION[item.category];
    
    if (!action) {
      if (import.meta.env.DEV) {
        console.warn('[CompanionLayer] No action for item category:', item.category);
      }
      return { success: false, error: `Cannot use ${item.category} items` };
    }
    
    if (!canUseItems) {
      if (import.meta.env.DEV) {
        console.warn('[CompanionLayer] Cannot use items - no companion selected');
      }
      return { success: false, error: 'No companion selected' };
    }
    
    if (import.meta.env.DEV) {
      console.log('[CompanionLayer] Using item:', item.name, 'with action:', action);
    }
    
    try {
      const result = await contextUseItem(item.id, action, 1);
      
      if (result.success) {
        if (import.meta.env.DEV) {
          console.log('[CompanionLayer] Item used successfully:', item.name, result.statsChanged);
        }
        // Close the menu after successful use
        closeMenu();
        return { success: true };
      } else {
        if (import.meta.env.DEV) {
          console.warn('[CompanionLayer] Item use failed:', result.error);
        }
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (import.meta.env.DEV) {
        console.error('[CompanionLayer] Item use error:', errorMessage);
      }
      return { success: false, error: errorMessage };
    }
  }, [canUseItems, contextUseItem, closeMenu]);
  
  // Handle companion click
  const handleCompanionClick = useCallback(() => {
    // Don't open menu during entry animation
    if (isEntering) return;
    
    toggleMenu();
  }, [isEntering, toggleMenu]);
  
  // Handle click outside menu
  const handleClickOutside = useCallback(() => {
    closeMenu();
  }, [closeMenu]);
  
  // Status-based emotion reactions for the companion
  // Uses the same two-layer system as the main BlobbiPage
  const isSleeping = companion?.state === 'sleeping';
  const companionStats = useMemo(() => companion?.stats ?? {
    hunger: 100, happiness: 100, health: 100, hygiene: 100, energy: 100,
  }, [companion?.stats]);
  
  const [companionActionOverride, setCompanionActionOverride] = useState<BlobbiEmotion | null>(null);
  
  const { baseEmotion: companionBaseEmotion, overlayEmotion: companionOverlayEmotion, bodyEffects: companionBodyEffects } = useStatusReaction({
    stats: companionStats,
    enabled: isVisible && !isSleeping && companion?.stage !== 'egg',
    actionOverride: companionActionOverride,
  });
  
  // Set action override when using items on companion
  // (This is triggered by handleItemUse above - we wrap it to add emotion)
  const originalHandleItemUse = handleItemUse;
  const handleItemUseWithEmotion = useCallback(async (item: CompanionItem): Promise<{ success: boolean; error?: string }> => {
    const action = CATEGORY_TO_ACTION[item.category] as ActionType | undefined;
    if (action) {
      setCompanionActionOverride(getActionEmotion(action));
      setTimeout(() => setCompanionActionOverride(null), 1500);
    }
    return originalHandleItemUse(item);
  }, [originalHandleItemUse]);
  
  // Compute the emotion prop: overlay if present, otherwise base
  const companionEmotionProp = companionOverlayEmotion ?? companionBaseEmotion;
  const companionBaseEmotionProp = companionBaseEmotion !== 'neutral' ? companionBaseEmotion : undefined;
  
  // Don't render anything if not visible
  if (!isVisible || !companion) {
    return null;
  }
  
  // Companion props
  const companionProps = {
    companion,
    state,
    motion,
    eyeOffset,
    isEntering,
    entryProgress,
    entryState,
    wasResolvedFromStuck,
    groundPosition,
    viewport,
    onStartDrag: startDrag,
    onUpdateDrag: updateDrag,
    onEndDrag: endDrag,
    onClick: handleCompanionClick,
    baseEmotion: companionBaseEmotionProp,
    emotion: companionEmotionProp,
    bodyEffects: companionBodyEffects ?? undefined,
    onPositionUpdate: handlePositionUpdate,
  };
  
  // Calculate ground position for debug line
  const debugGroundY = calculateGroundY(viewport.height, config.size, config);
  
  return (
    <div 
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9999 }}
      aria-hidden="true"
    >
      {/* DEBUG: Visible ground line */}
      {DEBUG_GROUND_CONTACT && (
        <>
          {/* Ground line where Blobbi's CONTAINER bottom should be */}
          <div 
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              top: debugGroundY + config.size, // Container bottom
              height: 2,
              backgroundColor: 'red',
              zIndex: 10002,
            }}
          />
          {/* Label for the ground line */}
          <div
            style={{
              position: 'fixed',
              right: 10,
              top: debugGroundY + config.size + 4,
              color: 'red',
              fontSize: 12,
              fontWeight: 'bold',
              zIndex: 10002,
              backgroundColor: 'white',
              padding: '2px 4px',
            }}
          >
            Container bottom (groundY + size = {Math.round(debugGroundY + config.size)}px)
          </div>
          {/* Another line showing the actual viewport bottom minus padding */}
          <div 
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              top: viewport.height - config.padding.bottom,
              height: 2,
              backgroundColor: 'blue',
              zIndex: 10002,
            }}
          />
          <div
            style={{
              position: 'fixed',
              right: 10,
              top: viewport.height - config.padding.bottom + 4,
              color: 'blue',
              fontSize: 12,
              fontWeight: 'bold',
              zIndex: 10002,
              backgroundColor: 'white',
              padding: '2px 4px',
            }}
          >
            Viewport - padding = {viewport.height - config.padding.bottom}px (Target ground)
          </div>
          {/* Entry type indicator */}
          {isEntering && (
            <div
              style={{
                position: 'fixed',
                left: 10,
                top: 10,
                color: entryState.entryType === 'fall' ? 'orange' : 'green',
                fontSize: 14,
                fontWeight: 'bold',
                zIndex: 10002,
                backgroundColor: 'white',
                padding: '4px 8px',
                borderRadius: 4,
              }}
            >
              Entry: {entryState.entryType.toUpperCase()} | Phase: {entryState.phase}
            </div>
          )}
        </>
      )}
      
      {/* Companion */}
      <div className="pointer-events-auto">
        <BlobbiCompanion 
          {...companionProps}
          debugMode={DEBUG_GROUND_CONTACT}
        />
      </div>
      
      {/* Action Menu - radial buttons around Blobbi */}
      <CompanionActionMenu
        isOpen={menuState.isOpen}
        companionPosition={renderedPosition}
        companionSize={config.size}
        actions={availableActions}
        selectedAction={menuState.selectedAction}
        onActionClick={selectAction}
        onClickOutside={handleClickOutside}
      />
      
      {/* Hanging Items - items displayed as hanging elements from top */}
      <HangingItems
        isVisible={menuState.isOpen && menuState.selectedAction !== null}
        selectedAction={menuState.selectedAction}
        items={menuState.items}
        viewportHeight={viewport.height}
        groundOffset={config.padding.bottom}
        companionPosition={renderedPosition}
        companionSize={config.size}
        onItemRelease={handleItemClick}
        onItemLanded={handleItemLanded}
        onItemUse={handleItemUseWithEmotion}
        isItemOnCooldown={isItemOnCooldown}
      />
    </div>
  );
}
