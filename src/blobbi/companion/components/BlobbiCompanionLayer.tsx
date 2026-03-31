/**
 * BlobbiCompanionLayer — Global orchestration layer for the companion.
 *
 * This component is the top-level coordinator. It is NOT a visual component.
 * It wires together:
 *   - Companion runtime (position, motion, gaze, entry animations)
 *   - Status reaction system (stats → visual recipe)
 *   - Action menu and hanging items interaction
 *   - Item use with temporary emotion overrides
 *
 * Visual rendering is delegated entirely to:
 *   BlobbiCompanion → BlobbiCompanionVisual → MemoizedBlobbiVisual → Visual → SvgRenderer
 *
 * This file should be placed at the app root level (renders a fixed overlay).
 */

import { useCallback, useState, useMemo } from 'react';

import { useBlobbiCompanion } from '../hooks/useBlobbiCompanion';
import { useCompanionItemReaction } from '../hooks/useCompanionItemReaction';
import { useActionEmotionOverride } from '../hooks/useActionEmotionOverride';
import { BlobbiCompanion } from './BlobbiCompanion';
import { DebugGroundOverlay } from './DebugGroundOverlay';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';
import { calculateGroundY } from '../utils/movement';
import { useStatusReaction } from '@/blobbi/ui/hooks/useStatusReaction';
import type { ActionType } from '@/blobbi/ui/lib/status-reactions';
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

/** Set to true to show debug ground-contact lines. */
const DEBUG_GROUND_CONTACT = false;

export function BlobbiCompanionLayer() {
  const {
    companion,
    isVisible,
    state,
    motion,
    eyeOffsetRef,
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

  // ── Rendered position tracking ─────────────────────────────────────────────
  // Tracks the actual visual position (including entry/float offsets) so
  // the action menu and hanging items can position relative to Blobbi.
  const [renderedPosition, setRenderedPosition] = useState<Position>(motion.position);

  const handlePositionUpdate = useCallback((position: Position) => {
    setRenderedPosition(position);
  }, []);

  // ── Item reaction ──────────────────────────────────────────────────────────

  const handleGlanceAtItem = useCallback((position: Position) => {
    triggerAttention(position, {
      duration: 800,
      priority: 'low',
      source: 'item-landed:glance',
      isGlance: true,
    });
  }, [triggerAttention]);

  const handleWalkToItem = useCallback((position: Position) => {
    triggerAttention(position, {
      duration: 1500,
      priority: 'normal',
      source: 'item-landed:need',
      isGlance: false,
    });
  }, [triggerAttention]);

  const { reactToItemLanding } = useCompanionItemReaction({
    isActive: isVisible && !isEntering,
    onGlance: handleGlanceAtItem,
    onWalkTo: handleWalkToItem,
  });

  const handleItemLanded = useCallback((data: ItemLandedData) => {
    if (import.meta.env.DEV) {
      console.log('[CompanionLayer] Item landed:', data.item.name, 'at', { x: data.x, y: data.y });
    }
    reactToItemLanding(data.item.category, { x: data.x, y: data.y });
  }, [reactToItemLanding]);

  // ── Action menu ────────────────────────────────────────────────────────────

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
      if (import.meta.env.DEV) {
        console.log('[CompanionLayer] Item released:', item);
      }
    },
  });

  const {
    useItem: contextUseItem,
    canUseItems,
    isItemOnCooldown,
  } = useBlobbiActions();

  // ── Item use with emotion override ─────────────────────────────────────────

  const { actionOverride, triggerOverride } = useActionEmotionOverride();

  const handleItemUse = useCallback(async (item: CompanionItem): Promise<{ success: boolean; error?: string }> => {
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

    // Trigger the temporary emotion override for visual feedback
    triggerOverride(action as ActionType);

    if (import.meta.env.DEV) {
      console.log('[CompanionLayer] Using item:', item.name, 'with action:', action);
    }

    try {
      const result = await contextUseItem(item.id, action, 1);

      if (result.success) {
        if (import.meta.env.DEV) {
          console.log('[CompanionLayer] Item used successfully:', item.name, result.statsChanged);
        }
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
  }, [canUseItems, contextUseItem, closeMenu, triggerOverride]);

  // ── Companion click ────────────────────────────────────────────────────────

  const handleCompanionClick = useCallback(() => {
    if (isEntering) return;
    toggleMenu();
  }, [isEntering, toggleMenu]);

  const handleClickOutside = useCallback(() => {
    closeMenu();
  }, [closeMenu]);

  // ── Status reaction ────────────────────────────────────────────────────────
  // Resolves companion stats into a visual recipe (sleepy, hungry, dirty, etc.).
  // The actionOverride from useActionEmotionOverride temporarily overrides
  // the recipe when an item is used (e.g., feeding → happy face for 1.5s).

  const isSleeping = companion?.state === 'sleeping';
  const companionStats = useMemo(() => companion?.stats ?? {
    hunger: 100, happiness: 100, health: 100, hygiene: 100, energy: 100,
  }, [companion?.stats]);

  const { recipe: companionRecipe, recipeLabel: companionRecipeLabel } = useStatusReaction({
    stats: companionStats,
    enabled: isVisible && !isSleeping && companion?.stage !== 'egg',
    actionOverride,
  });

  // ── Early return ───────────────────────────────────────────────────────────

  if (!isVisible || !companion) {
    return null;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const debugGroundY = calculateGroundY(viewport.height, config.size, config);

  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9999 }}
      aria-hidden="true"
    >
      {DEBUG_GROUND_CONTACT && (
        <DebugGroundOverlay
          groundY={debugGroundY}
          size={config.size}
          viewportHeight={viewport.height}
          paddingBottom={config.padding.bottom}
          isEntering={isEntering}
          entryState={entryState}
        />
      )}

      <div className="pointer-events-auto">
        <BlobbiCompanion
          companion={companion}
          state={state}
          motion={motion}
          eyeOffsetRef={eyeOffsetRef}
          isEntering={isEntering}
          entryProgress={entryProgress}
          entryState={entryState}
          wasResolvedFromStuck={wasResolvedFromStuck}
          groundPosition={groundPosition}
          viewport={viewport}
          onStartDrag={startDrag}
          onUpdateDrag={updateDrag}
          onEndDrag={endDrag}
          onClick={handleCompanionClick}
          recipe={companionRecipe}
          recipeLabel={companionRecipeLabel}
          onPositionUpdate={handlePositionUpdate}
          debugMode={DEBUG_GROUND_CONTACT}
        />
      </div>

      <CompanionActionMenu
        isOpen={menuState.isOpen}
        companionPosition={renderedPosition}
        companionSize={config.size}
        actions={availableActions}
        selectedAction={menuState.selectedAction}
        onActionClick={selectAction}
        onClickOutside={handleClickOutside}
      />

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
        onItemUse={handleItemUse}
        isItemOnCooldown={isItemOnCooldown}
      />
    </div>
  );
}
