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

import { useCallback, useState, useMemo, useRef, useEffect } from 'react';

import { useBlobbiCompanion } from '../hooks/useBlobbiCompanion';
import { useCompanionItemReaction } from '../hooks/useCompanionItemReaction';
import { useActionEmotionOverride } from '../hooks/useActionEmotionOverride';
import { useOverstimulationReaction } from '../hooks/useOverstimulationReaction';
import { useShakeReaction } from '../hooks/useShakeReaction';
import { createShakeTracker, recordSample, computeShakeResult, resetTracker } from '../core/shakeDetection';
import { BlobbiCompanion } from './BlobbiCompanion';
import { VomitSplat } from './VomitSplat';
import { OverstimulationBlockOverlay } from './OverstimulationBlockOverlay';
import { DebugGroundOverlay } from './DebugGroundOverlay';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';
import { calculateGroundY } from '../utils/movement';
import { useStatusReaction } from '@/blobbi/ui/hooks/useStatusReaction';
import { buildSleepingRecipe } from '@/blobbi/ui/lib/recipe';
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
import { useBlobbiSleepToggle } from '../interaction/useBlobbiSleepToggle';
import type { Position } from '../types/companion.types';

/** Set to true to show debug ground-contact lines. */
const DEBUG_GROUND_CONTACT = false;

const MAX_SPLATS = 3;

interface SplatData {
  id: number;
  spawnX: number;
  spawnY: number;
  landX: number;
  landY: number;
}

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

  // Standalone sleep/wake toggle — works without BlobbiPage mounted
  const { toggleSleep } = useBlobbiSleepToggle();

  // ── Item use with emotion override ─────────────────────────────────────────

  const { actionOverride, triggerOverride } = useActionEmotionOverride();

  // ── Overstimulation reaction ───────────────────────────────────────────────
  const {
    recipe: overstimRecipe,
    recipeLabel: overstimLabel,
    isBlocked: isOverstimBlocked,
  } = useOverstimulationReaction({
    isActive: isVisible && !isEntering,
  });

  // ── Shake reaction (dizzy / nausea) ───────────────────────────────────────
  const shakeTrackerRef = useRef(createShakeTracker());

  const companionHunger = companion?.stats.hunger ?? 100;

  const {
    recipe: shakeRecipe,
    recipeLabel: shakeLabel,
    vomitEvent,
    onDragUpdate: shakeOnDragUpdate,
    onDragEnd: shakeOnDragEnd,
    onDragStart: shakeOnDragStart,
  } = useShakeReaction({
    isActive: isVisible && !isEntering,
    hunger: companionHunger,
  });

  /** Feed pointer positions into the shake tracker during drag and
   *  push live shake results into the reaction hook each sample. */
  const handleDragSample = useCallback((position: Position) => {
    recordSample(shakeTrackerRef.current, position);
    // Compute live result so the hook can react during the drag
    const liveResult = computeShakeResult(shakeTrackerRef.current);
    shakeOnDragUpdate(liveResult);
  }, [shakeOnDragUpdate]);

  /** Wrap startDrag to also notify the shake system. */
  const handleStartDrag = useCallback(() => {
    resetTracker(shakeTrackerRef.current);
    shakeOnDragStart();
    startDrag();
  }, [startDrag, shakeOnDragStart]);

  /** Wrap endDrag to compute shake result and notify the shake system. */
  const handleEndDrag = useCallback(() => {
    const result = computeShakeResult(shakeTrackerRef.current);
    shakeOnDragEnd(result);
    resetTracker(shakeTrackerRef.current);
    endDrag();
  }, [endDrag, shakeOnDragEnd]);

  // ── Vomit splat management ─────────────────────────────────────────────────

  const [splats, setSplats] = useState<SplatData[]>([]);
  const lastVomitId = useRef(0);

  useEffect(() => {
    if (!vomitEvent || vomitEvent.id === lastVomitId.current) return;
    lastVomitId.current = vomitEvent.id;

    // Compute spawn position (Blobbi's mouth area)
    const spawnX = renderedPosition.x + config.size / 2;
    const spawnY = renderedPosition.y + config.size * 0.55;

    // Land a short distance below Blobbi (near feet), not at viewport bottom
    const floorLimit = viewport.height - config.padding.bottom;
    const landX = spawnX + (Math.random() * 30 - 15);
    const landY = Math.min(renderedPosition.y + config.size * 0.9, floorLimit);

    const newSplat: SplatData = {
      id: vomitEvent.id,
      spawnX,
      spawnY,
      landX,
      landY,
    };

    setSplats((prev) => {
      const next = [...prev, newSplat];
      // Cap at MAX_SPLATS — remove oldest
      if (next.length > MAX_SPLATS) {
        return next.slice(next.length - MAX_SPLATS);
      }
      return next;
    });
  }, [vomitEvent, renderedPosition, config.size, config.padding.bottom, viewport.height]);

  const removeSplat = useCallback((id: number) => {
    setSplats((prev) => prev.filter((s) => s.id !== id));
  }, []);

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
      const result = await contextUseItem(item.id, action);

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

  // ── Sleep action (direct, not item-based) ───────────────────────────────────

  const handleSleepAction = useCallback(async () => {
    closeMenu();
    try {
      await toggleSleep();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[CompanionLayer] Sleep toggle failed:', error);
      }
    }
  }, [toggleSleep, closeMenu]);

  /** Intercept action selection: sleep is a direct action, others go through item flow. */
  const handleActionClick = useCallback((action: Parameters<typeof selectAction>[0]) => {
    if (action === 'sleep') {
      handleSleepAction();
    } else {
      selectAction(action);
    }
  }, [handleSleepAction, selectAction]);

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
  //
  // Status reaction stays ENABLED during sleep so body effects (dirty) and
  // extras (food icon) still resolve. The sleeping recipe overlay is applied
  // on top to override the face while preserving compatible body effects.

  const isSleeping = companion?.state === 'sleeping';
  const companionStats = useMemo(() => companion?.stats ?? {
    hunger: 100, happiness: 100, health: 100, hygiene: 100, energy: 100,
  }, [companion?.stats]);

  const { recipe: statusRecipe, recipeLabel: statusRecipeLabel } = useStatusReaction({
    stats: companionStats,
    enabled: isVisible && companion?.stage !== 'egg',
    actionOverride: isSleeping ? null : actionOverride,
  });

  // Recipe priority chain (highest → lowest):
  //   1. Sleeping (always wins when companion is asleep)
  //   2. Overstimulation reaction (user spam-clicking)
  //   3. Shake reaction (dizzy / nausea from shaking)
  //   4. Action override (item use: feed → happy, etc.)
  //   5. Status recipe (stat-driven expressions)
  let companionRecipe: typeof statusRecipe;
  let companionRecipeLabel: string;

  if (isSleeping) {
    companionRecipe = buildSleepingRecipe(statusRecipe);
    companionRecipeLabel = 'sleeping';
  } else if (overstimRecipe && overstimLabel) {
    companionRecipe = overstimRecipe;
    companionRecipeLabel = overstimLabel;
  } else if (shakeRecipe && shakeLabel) {
    companionRecipe = shakeRecipe;
    companionRecipeLabel = shakeLabel;
  } else {
    companionRecipe = statusRecipe;
    companionRecipeLabel = statusRecipeLabel;
  }

  // ── Early return ───────────────────────────────────────────────────────────

  if (!isVisible || !companion) {
    return null;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const debugGroundY = calculateGroundY(viewport.height, config.size, config);

  return (
    <>
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

        {/* Vomit splats — rendered below companion z-index */}
        {splats.map((s) => (
          <VomitSplat
            key={s.id}
            id={s.id}
            spawnX={s.spawnX}
            spawnY={s.spawnY}
            landX={s.landX}
            landY={s.landY}
            onRemove={removeSplat}
          />
        ))}

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
            onStartDrag={handleStartDrag}
            onUpdateDrag={updateDrag}
            onEndDrag={handleEndDrag}
            onClick={handleCompanionClick}
            isClickBlocked={isOverstimBlocked}
            recipe={companionRecipe}
            recipeLabel={companionRecipeLabel}
            onPositionUpdate={handlePositionUpdate}
            onDragSample={handleDragSample}
            debugMode={DEBUG_GROUND_CONTACT}
          />
        </div>

        <CompanionActionMenu
          isOpen={menuState.isOpen}
          companionPosition={renderedPosition}
          companionSize={config.size}
          actions={availableActions}
          selectedAction={menuState.selectedAction}
          onActionClick={handleActionClick}
          onClickOutside={handleClickOutside}
          isSleeping={isSleeping}
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

      {/* Overlay sits outside the zoom container so it stays at viewport scale */}
      <OverstimulationBlockOverlay
        isBlocked={isOverstimBlocked}
      />
    </>
  );
}
