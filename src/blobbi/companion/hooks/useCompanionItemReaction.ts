/**
 * useCompanionItemReaction Hook
 * 
 * Handles Blobbi's reaction when items land on the ground.
 * Uses the centralized need detection system to determine:
 * - If Blobbi needs the item: trigger movement toward it
 * - If Blobbi doesn't need the item: trigger a brief glance
 * 
 * Architecture:
 * - Fetches companion stats from the active companion
 * - Uses checkItemCategoryNeed to determine need level
 * - Coordinates with attention system for glance behavior
 * - Provides walkTo callback for movement (to be handled by motion system)
 */

import { useCallback, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBlobbonautProfile } from '@/hooks/useBlobbonautProfile';
import {
  KIND_BLOBBI_STATE,
  isValidBlobbiEvent,
  parseBlobbiEvent,
  type BlobbiStats,
} from '@/blobbi/core/lib/blobbi';
import { checkItemCategoryNeed, type NeedCheckResult } from '../interaction/needDetection';
import type { ShopItemCategory } from '@/blobbi/shop/types/shop.types';
import type { Position } from '../types/companion.types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ItemReactionResult {
  /** Whether Blobbi needs this item category */
  needsItem: boolean;
  /** The need check result with full details */
  needResult: NeedCheckResult;
}

export interface UseCompanionItemReactionOptions {
  /** Whether the reaction system is active */
  isActive: boolean;
  /** Callback to trigger attention (glance at item) */
  onGlance?: (position: Position) => void;
  /** Callback to trigger walk to item position */
  onWalkTo?: (position: Position) => void;
}

export interface UseCompanionItemReactionResult {
  /** Check if Blobbi needs an item and get reaction details */
  checkItemNeed: (category: ShopItemCategory) => ItemReactionResult | null;
  /** React to an item landing - handles both needed and not-needed cases */
  reactToItemLanding: (category: ShopItemCategory, position: Position) => void;
  /** Whether companion stats are available */
  hasStats: boolean;
  /** Current companion stats (for debugging/display) */
  stats: Partial<BlobbiStats> | null;
}

// ─── Configuration ────────────────────────────────────────────────────────────

const REACTION_CONFIG = {
  /** Delay before reacting to item landing (ms) - feels more natural */
  reactionDelay: 150,
  /** Minimum time between reactions (ms) - prevents spam */
  reactionCooldown: 500,
  /** Glance duration for non-needed items (ms) */
  glanceDuration: 800,
};

// ─── Hook Implementation ──────────────────────────────────────────────────────

export function useCompanionItemReaction({
  isActive,
  onGlance,
  onWalkTo,
}: UseCompanionItemReactionOptions): UseCompanionItemReactionResult {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { profile } = useBlobbonautProfile();
  
  // Track last reaction time to prevent spam
  const lastReactionTimeRef = useRef<number>(0);
  
  // Get current companion's d-tag from profile
  const currentCompanionD = profile?.currentCompanion;
  
  // Fetch companion stats
  const statsQuery = useQuery({
    queryKey: ['companion-stats', user?.pubkey, currentCompanionD],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey || !currentCompanionD) return null;
      
      const events = await nostr.query([{
        kinds: [KIND_BLOBBI_STATE],
        authors: [user.pubkey],
        '#d': [currentCompanionD],
      }], { signal });
      
      const validEvents = events
        .filter(isValidBlobbiEvent)
        .sort((a, b) => b.created_at - a.created_at);
      
      if (validEvents.length === 0) return null;
      
      const companion = parseBlobbiEvent(validEvents[0]);
      return companion?.stats ?? null;
    },
    enabled: isActive && !!user?.pubkey && !!currentCompanionD,
    staleTime: 30_000, // 30 seconds - stats don't change that fast
    gcTime: 60_000, // 1 minute
  });
  
  const stats = statsQuery.data ?? null;
  const hasStats = stats !== null;
  
  /**
   * Check if Blobbi needs an item category based on current stats.
   */
  const checkItemNeed = useCallback((category: ShopItemCategory): ItemReactionResult | null => {
    if (!stats) return null;
    
    const needResult = checkItemCategoryNeed(category, stats);
    return {
      needsItem: needResult.needsItem,
      needResult,
    };
  }, [stats]);
  
  /**
   * React to an item landing on the ground.
   * 
   * - If Blobbi needs the item: walk toward it (via onWalkTo)
   * - If Blobbi doesn't need the item: glance at it briefly (via onGlance)
   */
  const reactToItemLanding = useCallback((category: ShopItemCategory, position: Position) => {
    if (!isActive || !stats) return;
    
    // Rate limit reactions
    const now = Date.now();
    if (now - lastReactionTimeRef.current < REACTION_CONFIG.reactionCooldown) {
      return;
    }
    lastReactionTimeRef.current = now;
    
    const needResult = checkItemCategoryNeed(category, stats);
    
    // Delay reaction slightly for more natural feel
    setTimeout(() => {
      if (needResult.needsItem) {
        // Blobbi needs this item - walk toward it
        if (import.meta.env.DEV) {
          console.log('[CompanionItemReaction] Blobbi needs item, walking to:', {
            category,
            priority: needResult.priority,
            triggeringStat: needResult.triggeringStat,
            position,
          });
        }
        onWalkTo?.(position);
      } else {
        // Blobbi doesn't need this item - just glance at it
        if (import.meta.env.DEV) {
          console.log('[CompanionItemReaction] Blobbi glancing at unneeded item:', {
            category,
            position,
          });
        }
        onGlance?.(position);
      }
    }, REACTION_CONFIG.reactionDelay);
  }, [isActive, stats, onGlance, onWalkTo]);
  
  return {
    checkItemNeed,
    reactToItemLanding,
    hasStats,
    stats,
  };
}
