/**
 * HangingItems
 * 
 * Displays inventory items as hanging elements from the top of the screen.
 * Each item appears as a circle connected to the top by a thin vertical line,
 * creating a playful, spatial feel.
 * 
 * State Model:
 * - Container states: hidden → opening → open → closing → hidden
 * - Hanging items = available inventory that can still be released
 * - Released/dropped items = instances currently in the world (tracked with unique IDs)
 * - Multiple instances of the same item type can exist simultaneously on the ground
 * 
 * Key Design Principle:
 * The hanging row represents "releasable quantity" - clicking releases ONE instance
 * and immediately decrements the visible quantity. A new hanging copy remains if
 * quantity > 1. The released instance tracks separately with a unique instance ID.
 * 
 * Features:
 * - Smooth open/close slide animations (items descend/ascend)
 * - Thin vertical lines from the top of screen
 * - Circular containers for hanging items
 * - Click releases item: one instance falls, remaining quantity stays hanging
 * - Multiple dropped instances of same item type can exist
 * - Contact detection: items auto-use when touching Blobbi
 * - Click-to-use: click landed items to use them
 * - Drag-and-drop: drag landed items to Blobbi to use them
 * 
 * All three item use methods (contact, click, drag-drop) use the same
 * real item-use flow via onItemUse callback.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';
import type { CompanionItem, CompanionMenuAction } from './types';
import { getMenuActionConfig } from './types';
import type { Position } from '../types/companion.types';

// ─── Types ────────────────────────────────────────────────────────────────────

/** State of the hanging items container */
type ContainerState = 'hidden' | 'opening' | 'open' | 'closing';

/** Lifecycle state of a released item */
type ReleasedItemState = 'falling' | 'landed' | 'dragging';

/** Data for a released item instance (tracks its entire lifecycle after being clicked) */
interface ReleasedItemData {
  /** Unique instance ID (different from item.id - allows multiple instances of same item type) */
  instanceId: string;
  /** The item data (note: item.id is the item TYPE id, not the instance) */
  item: CompanionItem;
  state: ReleasedItemState;
  /** X position (center of item) */
  x: number;
  /** Current Y position (animated during fall, final position when landed) */
  y: number;
  /** Y position where item started falling */
  startY: number;
  /** Y position where item will land (or was before dragging) */
  targetY: number;
  /** Timestamp when fall started */
  fallStartTime: number;
  /** X position before dragging started (for drop-elsewhere behavior) */
  dragStartX?: number;
  /** Y position before dragging started (for drop-elsewhere behavior) */
  dragStartY?: number;
}

/** Result of attempting to use an item */
interface ItemUseAttemptResult {
  /** Whether the item was successfully used */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/** Data passed when an item lands */
export interface ItemLandedData {
  /** The item that landed */
  item: CompanionItem;
  /** Unique instance ID */
  instanceId: string;
  /** X position where the item landed */
  x: number;
  /** Y position where the item landed */
  y: number;
}

/** Props for the HangingItems component */
interface HangingItemsProps {
  /** Whether to show the hanging items */
  isVisible: boolean;
  /** The selected action (for empty state messaging) */
  selectedAction: CompanionMenuAction | null;
  /** Items to display */
  items: CompanionItem[];
  /** Viewport height for calculating ground position */
  viewportHeight?: number;
  /** Ground Y offset from bottom of viewport */
  groundOffset?: number;
  /** Blobbi's current position (for contact detection) */
  companionPosition?: Position;
  /** Blobbi's size (for contact detection) */
  companionSize?: number;
  /** Callback when an item is clicked/released */
  onItemRelease?: (item: CompanionItem) => void;
  /** 
   * Callback when an item finishes falling and lands on the ground.
   * Includes position info for Blobbi to react to.
   */
  onItemLanded?: (data: ItemLandedData) => void;
  /** 
   * Callback to use an item. Returns success/failure.
   * Item is only removed from screen if this returns success.
   * If not provided, items disappear immediately on contact (legacy behavior).
   */
  onItemUse?: (item: CompanionItem) => Promise<ItemUseAttemptResult>;
  /** 
   * Callback when an item is collected by Blobbi (contact).
   * @deprecated Use onItemUse instead for proper item consumption flow.
   */
  onItemCollected?: (item: CompanionItem) => void;
  /**
   * Check if an item is on cooldown (recently attempted).
   * If provided, items on cooldown won't trigger contact-based auto-use.
   */
  isItemOnCooldown?: (itemId: string) => boolean;
}

// ─── Configuration ────────────────────────────────────────────────────────────

const HANGING_CONFIG = {
  /** Size of hanging item circles (reduced for better proportion) */
  circleSize: 56,
  /** Emoji font size for hanging items */
  emojiSize: '1.75rem',
  /** Emoji font size for falling/landed items */
  fallingEmojiSize: '1.875rem',
  /** Horizontal spacing between items (center to center) */
  itemSpacing: 80,
  /** Length of the hanging line */
  lineLength: 100,
  /** Width of the hanging line */
  lineWidth: 2,
  /** Duration of open/close slide animation (ms) */
  slideAnimationDuration: 350,
  /** Stagger delay between items during open (ms) */
  staggerDelay: 40,
  /** Base fall duration for full-screen falls (ms) - shorter falls scale proportionally */
  baseFallDuration: 600,
  /** Minimum fall duration even for very short falls (ms) */
  minFallDuration: 150,
  /** Reference fall distance for base duration (pixels) */
  baseFallDistance: 500,
  /** Ground offset from bottom of viewport */
  defaultGroundOffset: 40,
  /** Size of quantity badge */
  badgeSize: 20,
  /** Size of landed item hitbox for contact detection */
  landedItemSize: 40,
  /** Contact detection radius (how close Blobbi needs to be) */
  contactRadius: 50,
  /** Drag threshold - min distance to start drag instead of click */
  dragThreshold: 5,
  /** Drop-on-Blobbi radius (how close to Blobbi center to trigger use) */
  dropRadius: 80,
  /** Cooldown after failed item use attempt (ms) */
  failedUseCooldown: 3000,
  /** Cooldown after successful item use (ms) */
  successUseCooldown: 500,
};

// ─── Drag State Hook ──────────────────────────────────────────────────────────

interface DragState {
  /** Whether currently dragging */
  isDragging: boolean;
  /** Instance ID being dragged (or null) */
  instanceId: string | null;
  /** Current drag position X */
  currentX: number;
  /** Current drag position Y */
  currentY: number;
  /** Whether the item is currently over Blobbi (for visual feedback) */
  isOverBlobbi: boolean;
}

const initialDragState: DragState = {
  isDragging: false,
  instanceId: null,
  currentX: 0,
  currentY: 0,
  isOverBlobbi: false,
};

// ─── Released Item Component ──────────────────────────────────────────────────

interface ReleasedItemProps {
  data: ReleasedItemData;
  /** Whether this item is currently being used (prevents interaction) */
  isBeingUsed?: boolean;
  /** Current drag state */
  dragState: DragState;
  /** Callbacks for drag events */
  onDragStart: (instanceId: string, item: CompanionItem, x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
  /** Callback for click (when not dragging) */
  onCollect?: (instanceId: string, item: CompanionItem) => void;
}

/**
 * A released item that is either falling, landed, or being dragged.
 * This is a single continuous visual element - just the emoji.
 * No circle container, no badge - just the item itself.
 * 
 * Supports:
 * - Click to use (when landed, if not dragged)
 * - Drag to Blobbi to use (when landed)
 */
function ReleasedItem({ 
  data, 
  isBeingUsed = false, 
  dragState,
  onDragStart,
  onDragMove,
  onDragEnd,
  onCollect,
}: ReleasedItemProps) {
  const { item, state } = data;
  
  // Local refs for tracking pointer state
  const pointerDownRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const isDraggingLocalRef = useRef(false);
  const elementRef = useRef<HTMLDivElement>(null);
  
  const isFalling = state === 'falling';
  const isLanded = state === 'landed';
  const isDragging = state === 'dragging';
  const isThisItemDragging = dragState.isDragging && dragState.instanceId === data.instanceId;
  
  // Calculate display position - use drag position if dragging, otherwise use data position
  const displayX = isThisItemDragging ? dragState.currentX : data.x;
  const displayY = isThisItemDragging ? dragState.currentY : data.y;
  
  // Can interact when landed and not being used
  const canInteract = isLanded && !isBeingUsed && !dragState.isDragging;
  
  // Handle pointer down - start tracking for potential drag
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isLanded || isBeingUsed) return;
    
    // Capture pointer for drag tracking
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    pointerDownRef.current = {
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
    };
    isDraggingLocalRef.current = false;
  }, [isLanded, isBeingUsed]);
  
  // Handle pointer move - detect drag start and update position
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerDownRef.current) return;
    
    const dx = e.clientX - pointerDownRef.current.x;
    const dy = e.clientY - pointerDownRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Check if we've moved enough to start dragging
    if (!isDraggingLocalRef.current && distance > HANGING_CONFIG.dragThreshold) {
      isDraggingLocalRef.current = true;
      onDragStart(data.instanceId, item, e.clientX, e.clientY);
    }
    
    // If dragging, update position
    if (isDraggingLocalRef.current) {
      onDragMove(e.clientX, e.clientY);
    }
  }, [data.instanceId, item, onDragStart, onDragMove]);
  
  // Handle pointer up - end drag or trigger click
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!pointerDownRef.current) return;
    
    // Release pointer capture
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if capture was already released
    }
    
    const wasDragging = isDraggingLocalRef.current;
    
    // Reset local state
    pointerDownRef.current = null;
    isDraggingLocalRef.current = false;
    
    if (wasDragging) {
      // End drag
      onDragEnd();
    } else {
      // It was a click (no significant movement)
      onCollect?.(data.instanceId, item);
    }
  }, [data.instanceId, item, onCollect, onDragEnd]);
  
  // Handle pointer cancel (e.g., interrupted by system)
  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    
    if (isDraggingLocalRef.current) {
      onDragEnd();
    }
    
    pointerDownRef.current = null;
    isDraggingLocalRef.current = false;
  }, [onDragEnd]);
  
  return (
    <div
      ref={elementRef}
      className={cn(
        "fixed select-none touch-none",
        "transition-transform",
        // Quick transitions for non-dragging states
        !isThisItemDragging && "duration-100",
        // Instant position updates when dragging
        isThisItemDragging && "duration-0",
        // Visual feedback when dragging over Blobbi
        isThisItemDragging && dragState.isOverBlobbi && "scale-125",
        // Hover effect only for interactable landed items
        canInteract && "hover:scale-125 cursor-grab",
        // Grabbing cursor while dragging
        isThisItemDragging && "cursor-grabbing",
        // Falling items or items being used can't be interacted with
        (isFalling || isBeingUsed) && "pointer-events-none",
        // Always enable pointer events for landed/dragging items
        (isLanded || isDragging) && "pointer-events-auto",
        // Pulse animation when being used
        isBeingUsed && "animate-pulse"
      )}
      style={{
        left: displayX,
        top: displayY,
        transform: 'translate(-50%, -50%)',
        zIndex: isThisItemDragging ? 10006 : isFalling ? 10004 : 10003,
        // Add subtle shadow for depth
        filter: isThisItemDragging 
          ? 'drop-shadow(0 8px 12px rgba(0,0,0,0.35))'
          : isLanded 
            ? 'drop-shadow(0 2px 3px rgba(0,0,0,0.2))' 
            : 'drop-shadow(0 3px 6px rgba(0,0,0,0.25))',
        opacity: isBeingUsed ? 0.6 : 1,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      role={canInteract ? 'button' : undefined}
      aria-label={canInteract ? `${item.name} on ground. Click or drag to Blobbi to use.` : undefined}
    >
      <span
        style={{ 
          fontSize: HANGING_CONFIG.fallingEmojiSize,
          // Subtle rotation during fall for liveliness
          transform: isFalling ? 'rotate(-5deg)' : isThisItemDragging ? 'rotate(5deg)' : 'rotate(0deg)',
          transition: isThisItemDragging ? 'transform 50ms ease-out' : 'transform 100ms ease-out',
          display: 'block',
        }}
        role="img"
        aria-hidden="true"
      >
        {item.emoji}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function HangingItems({
  isVisible,
  selectedAction,
  items,
  viewportHeight = window.innerHeight,
  groundOffset = HANGING_CONFIG.defaultGroundOffset,
  companionPosition,
  companionSize = 108, // Should match DEFAULT_COMPANION_CONFIG.size
  onItemRelease,
  onItemLanded,
  onItemUse,
  onItemCollected,
  isItemOnCooldown,
}: HangingItemsProps) {
  // Container animation state
  const [containerState, setContainerState] = useState<ContainerState>('hidden');
  
  // Track how many instances of each item type have been released (not yet used)
  // Key: item.id (type ID), Value: count of released instances
  const [releasedCountByItemId, setReleasedCountByItemId] = useState<Map<string, number>>(new Map());
  
  // Counter for generating unique instance IDs
  const instanceCounterRef = useRef(0);
  
  // Track items currently being used (to prevent double-use)
  // Use a ref to avoid callback identity changes that trigger effect loops
  // Key: instanceId (not item.id)
  const itemsBeingUsedRef = useRef<Set<string>>(new Set());
  const [, forceUpdate] = useState(0); // For forcing re-render when itemsBeingUsed changes
  
  // Track released items with their full state (falling/landed/dragging)
  // Key: instanceId (unique per dropped instance), Value: ReleasedItemData
  const [releasedItems, setReleasedItems] = useState<Map<string, ReleasedItemData>>(new Map());
  
  // Drag state
  const [dragState, setDragState] = useState<DragState>(initialDragState);
  
  // Animation frame ref for fall animation
  const animationRef = useRef<number | null>(null);
  
  // Ref to track if animation is running (to avoid duplicate loops)
  const isAnimatingRef = useRef(false);
  
  // Ref to access latest releasedItems in animation loop without re-triggering effect
  const releasedItemsRef = useRef<Map<string, ReleasedItemData>>(releasedItems);
  releasedItemsRef.current = releasedItems;
  
  // ─── Zone Entry Detection ───
  // Track which items are currently inside the contact zone
  // Contact auto-use only triggers when item ENTERS the zone (transitions from outside to inside)
  const itemsInZoneRef = useRef<Set<string>>(new Set());
  
  // Local item cooldown tracking (fallback if isItemOnCooldown not provided)
  const localCooldownsRef = useRef<Map<string, number>>(new Map());
  
  // Check if an item is on cooldown (uses prop if available, else local)
  const checkItemCooldown = useCallback((itemId: string): boolean => {
    if (isItemOnCooldown) {
      return isItemOnCooldown(itemId);
    }
    // Local fallback cooldown check
    const expiresAt = localCooldownsRef.current.get(itemId);
    if (!expiresAt) return false;
    if (Date.now() >= expiresAt) {
      localCooldownsRef.current.delete(itemId);
      return false;
    }
    return true;
  }, [isItemOnCooldown]);
  
  // Set local cooldown for an item
  const setLocalCooldown = useCallback((itemId: string, success: boolean) => {
    const cooldownMs = success 
      ? HANGING_CONFIG.successUseCooldown 
      : HANGING_CONFIG.failedUseCooldown;
    localCooldownsRef.current.set(itemId, Date.now() + cooldownMs);
  }, []);
  
  // Ref for onItemLanded callback
  const onItemLandedRef = useRef(onItemLanded);
  onItemLandedRef.current = onItemLanded;
  
  // Ref for onItemUse callback to avoid recreating attemptUseItem
  const onItemUseRef = useRef(onItemUse);
  onItemUseRef.current = onItemUse;
  
  // Ref for onItemCollected callback
  const onItemCollectedRef = useRef(onItemCollected);
  onItemCollectedRef.current = onItemCollected;
  
  // Calculate ground Y position (where items land)
  const groundY = viewportHeight - groundOffset - HANGING_CONFIG.landedItemSize / 2;
  
  // Calculate the Y position where hanging items are (bottom of circle)
  const hangingBottomY = HANGING_CONFIG.lineLength + HANGING_CONFIG.circleSize;
  
  // Calculate Blobbi center for drop detection
  const blobbiCenterX = companionPosition ? companionPosition.x + companionSize / 2 : 0;
  const blobbiCenterY = companionPosition ? companionPosition.y + companionSize / 2 : 0;
  
  /**
   * Calculate fall duration based on distance.
   * Shorter falls have proportionally shorter durations.
   */
  const calculateFallDuration = useCallback((fallDistance: number): number => {
    const ratio = fallDistance / HANGING_CONFIG.baseFallDistance;
    const duration = HANGING_CONFIG.baseFallDuration * Math.sqrt(ratio); // sqrt for more natural feel
    return Math.max(HANGING_CONFIG.minFallDuration, duration);
  }, []);
  
  // Animation loop function (defined once, uses refs)
  const runAnimationLoop = useCallback(() => {
    if (isAnimatingRef.current) return; // Already running
    isAnimatingRef.current = true;
    
    const animate = () => {
      const now = performance.now();
      let hasActiveFalls = false;
      
      // Work with the ref to get current state
      const currentItems = releasedItemsRef.current;
      const updates: Array<{ id: string; data: ReleasedItemData }> = [];
      
      for (const [id, data] of currentItems) {
        if (data.state === 'falling') {
          hasActiveFalls = true;
          const elapsed = now - data.fallStartTime;
          
          // Calculate duration based on fall distance for natural feel
          const fallDistance = data.targetY - data.startY;
          const fallDuration = calculateFallDuration(fallDistance);
          const progress = Math.min(elapsed / fallDuration, 1);
          
          // Easing function for natural fall (accelerate then slow)
          const easeProgress = progress < 0.8 
            ? Math.pow(progress / 0.8, 2) * 0.9
            : 0.9 + (progress - 0.8) / 0.2 * 0.1;
          
          const newY = data.startY + (data.targetY - data.startY) * easeProgress;
          
          if (progress >= 1) {
            // Landing complete
            const landedData = { ...data, state: 'landed' as const, y: data.targetY };
            updates.push({ id, data: landedData });
            onItemLandedRef.current?.({
              item: data.item,
              instanceId: data.instanceId,
              x: data.x,
              y: data.targetY,
            });
          } else {
            // Update position during fall
            updates.push({ id, data: { ...data, y: newY } });
          }
        }
      }
      
      // Apply updates if any
      if (updates.length > 0) {
        setReleasedItems(prev => {
          const next = new Map(prev);
          for (const { id, data } of updates) {
            next.set(id, data);
          }
          return next;
        });
      }
      
      // Continue loop if there are still falling items
      if (hasActiveFalls) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        isAnimatingRef.current = false;
        animationRef.current = null;
      }
    };
    
    // Start the loop
    animationRef.current = requestAnimationFrame(animate);
  }, [calculateFallDuration]);
  
  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
        isAnimatingRef.current = false;
      }
    };
  }, []);
  
  // Handle visibility changes with animation
  useEffect(() => {
    if (isVisible && selectedAction) {
      // Opening
      if (containerState === 'hidden' || containerState === 'closing') {
        setContainerState('opening');
        
        // Transition to open after animation
        const timer = setTimeout(() => {
          setContainerState('open');
        }, HANGING_CONFIG.slideAnimationDuration);
        
        return () => clearTimeout(timer);
      }
    } else {
      // Closing
      if (containerState === 'open' || containerState === 'opening') {
        setContainerState('closing');
        
        // Transition to hidden after animation
        const timer = setTimeout(() => {
          setContainerState('hidden');
          // Clear released counts when closing (but keep released items on ground)
          setReleasedCountByItemId(new Map());
        }, HANGING_CONFIG.slideAnimationDuration);
        
        return () => clearTimeout(timer);
      }
    }
  }, [isVisible, selectedAction, containerState]);
  
  /**
   * Attempt to use an item instance (via contact, click, or drag-drop).
   * Only removes the item from screen if use succeeds.
   * 
   * Uses refs for callbacks and itemsBeingUsed to maintain stable identity
   * and prevent effect/callback loops.
   * 
   * Includes cooldown protection:
   * - Checks cooldown before attempting (by instanceId)
   * - Sets cooldown after attempt (longer on failure)
   * 
   * @param instanceId - Unique instance ID (for tracking this specific dropped item)
   * @param item - The item data
   * @param source - How the item was used
   */
  const attemptUseItem = useCallback(async (instanceId: string, item: CompanionItem, source: 'contact' | 'click' | 'drag-drop') => {
    // Check cooldown first (prevents retry spam) - use instanceId for cooldown tracking
    if (checkItemCooldown(instanceId)) {
      if (import.meta.env.DEV) {
        console.log(`[HangingItems] Item on cooldown, skipping:`, item.name, instanceId);
      }
      return;
    }
    
    // Prevent double-use while an operation is in progress
    if (itemsBeingUsedRef.current.has(instanceId)) {
      if (import.meta.env.DEV) {
        console.log(`[HangingItems] Skipping duplicate use attempt for:`, item.name, instanceId);
      }
      return;
    }
    
    // Mark as being used (use ref to avoid state changes that trigger loops)
    itemsBeingUsedRef.current = new Set(itemsBeingUsedRef.current).add(instanceId);
    forceUpdate(c => c + 1); // Trigger re-render for visual feedback
    
    let success = false;
    
    try {
      // If onItemUse is provided, use the async flow
      const onItemUseFn = onItemUseRef.current;
      if (onItemUseFn) {
        if (import.meta.env.DEV) {
          console.log(`[HangingItems] Attempting to use item (${source}):`, item.name, instanceId);
        }
        const result = await onItemUseFn(item);
        
        if (result.success) {
          success = true;
          if (import.meta.env.DEV) {
            console.log(`[HangingItems] Item used successfully:`, item.name, instanceId);
          }
          // Remove from released items only on success (by instanceId)
          setReleasedItems(prev => {
            const next = new Map(prev);
            next.delete(instanceId);
            return next;
          });
          // Also remove from zone tracking
          itemsInZoneRef.current.delete(instanceId);
          // Decrement the released count for this item type (since the instance is now consumed)
          setReleasedCountByItemId(prev => {
            const next = new Map(prev);
            const currentCount = next.get(item.id) || 0;
            if (currentCount > 0) {
              next.set(item.id, currentCount - 1);
            }
            return next;
          });
        } else {
          if (import.meta.env.DEV) {
            console.log(`[HangingItems] Item use failed:`, item.name, result.error);
          }
          // Item stays on screen - user can try again after cooldown
        }
      } else {
        // Legacy behavior: call onItemCollected and remove immediately
        success = true;
        if (import.meta.env.DEV) {
          console.log(`[HangingItems] Item collected (legacy):`, item.name, instanceId);
        }
        onItemCollectedRef.current?.(item);
        setReleasedItems(prev => {
          const next = new Map(prev);
          next.delete(instanceId);
          return next;
        });
        itemsInZoneRef.current.delete(instanceId);
        // Decrement the released count for this item type
        setReleasedCountByItemId(prev => {
          const next = new Map(prev);
          const currentCount = next.get(item.id) || 0;
          if (currentCount > 0) {
            next.set(item.id, currentCount - 1);
          }
          return next;
        });
      }
    } finally {
      // Clear the "being used" state
      const newSet = new Set(itemsBeingUsedRef.current);
      newSet.delete(instanceId);
      itemsBeingUsedRef.current = newSet;
      forceUpdate(c => c + 1);
      
      // Set cooldown (longer on failure to prevent retry spam)
      setLocalCooldown(instanceId, success);
    }
  }, [checkItemCooldown, setLocalCooldown]); // Minimal dependencies - rest uses refs
  
  // Contact detection with Blobbi (for auto-use)
  // 
  // ZONE ENTRY DETECTION: Items only auto-use when they ENTER the contact zone.
  // This prevents continuous retries while an item remains overlapping with Blobbi.
  // 
  // Flow:
  // 1. Track which items are currently inside the zone (itemsInZoneRef)
  // 2. Only trigger use when item transitions from outside → inside
  // 3. Item must leave the zone before it can trigger again
  // 
  // Protection layers:
  // - Zone entry detection (this effect)
  // - Cooldown check in attemptUseItem
  // - itemsBeingUsedRef to prevent double-calls
  useEffect(() => {
    if (!companionPosition) return;
    // Don't check contact while dragging
    if (dragState.isDragging) return;
    
    // Check each landed item for contact
    releasedItems.forEach((data, id) => {
      // Skip items that are being used or still falling
      if (data.state !== 'landed' || itemsBeingUsedRef.current.has(id)) {
        return;
      }
      
      // Calculate distance between Blobbi center and item center
      const dx = blobbiCenterX - data.x;
      const dy = blobbiCenterY - data.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Contact threshold is sum of radii
      const contactThreshold = companionSize / 2 + HANGING_CONFIG.contactRadius;
      const isInZone = distance < contactThreshold;
      const wasInZone = itemsInZoneRef.current.has(id);
      
      if (isInZone) {
        if (!wasInZone) {
          // Item just ENTERED the zone - mark it and attempt use
          itemsInZoneRef.current.add(id);
          
          // Only attempt use on zone ENTRY (not while already in zone)
          // Cooldown and other guards are checked inside attemptUseItem
          attemptUseItem(data.instanceId, data.item, 'contact');
        }
        // If already in zone, do nothing (prevents retry loops)
      } else {
        // Item is outside the zone
        if (wasInZone) {
          // Item just LEFT the zone - remove from tracking
          // This allows it to trigger again if it re-enters
          itemsInZoneRef.current.delete(id);
        }
      }
    });
  }, [companionPosition, companionSize, releasedItems, attemptUseItem, dragState.isDragging, blobbiCenterX, blobbiCenterY]);
  
  // ─── Drag Handlers ────────────────────────────────────────────────────────────
  
  const handleDragStart = useCallback((instanceId: string, item: CompanionItem, x: number, y: number) => {
    // Get current item data (by instanceId)
    const itemData = releasedItems.get(instanceId);
    if (!itemData || itemData.state !== 'landed') return;
    
    // Update item state to dragging and store original position
    setReleasedItems(prev => {
      const next = new Map(prev);
      const current = next.get(instanceId);
      if (current) {
        next.set(instanceId, {
          ...current,
          state: 'dragging',
          dragStartX: current.x,
          dragStartY: current.y,
        });
      }
      return next;
    });
    
    // Check if over Blobbi
    const isOverBlobbi = companionPosition 
      ? Math.sqrt(Math.pow(x - blobbiCenterX, 2) + Math.pow(y - blobbiCenterY, 2)) < HANGING_CONFIG.dropRadius
      : false;
    
    setDragState({
      isDragging: true,
      instanceId,
      currentX: x,
      currentY: y,
      isOverBlobbi,
    });
  }, [releasedItems, companionPosition, blobbiCenterX, blobbiCenterY]);
  
  const handleDragMove = useCallback((x: number, y: number) => {
    if (!dragState.isDragging) return;
    
    // Check if over Blobbi
    const isOverBlobbi = companionPosition 
      ? Math.sqrt(Math.pow(x - blobbiCenterX, 2) + Math.pow(y - blobbiCenterY, 2)) < HANGING_CONFIG.dropRadius
      : false;
    
    setDragState(prev => ({
      ...prev,
      currentX: x,
      currentY: y,
      isOverBlobbi,
    }));
  }, [dragState.isDragging, companionPosition, blobbiCenterX, blobbiCenterY]);
  
  const handleDragEnd = useCallback(() => {
    if (!dragState.isDragging || !dragState.instanceId) {
      setDragState(initialDragState);
      return;
    }
    
    const instanceId = dragState.instanceId;
    const itemData = releasedItems.get(instanceId);
    
    if (!itemData) {
      setDragState(initialDragState);
      return;
    }
    
    // Capture original position before any state changes
    const originalX = itemData.dragStartX ?? itemData.x;
    const originalY = itemData.dragStartY ?? itemData.y;
    
    // Check if dropped on Blobbi
    if (dragState.isOverBlobbi) {
      // IMPORTANT: When dropping on Blobbi, we reset the item to its ORIGINAL position
      // before attempting to use it. This prevents the contact detection effect from
      // also triggering (since the item won't be near Blobbi anymore).
      // If use succeeds, the item is removed. If it fails, it's already back in place.
      setReleasedItems(prev => {
        const next = new Map(prev);
        const current = next.get(instanceId);
        if (current) {
          next.set(instanceId, {
            ...current,
            state: 'landed',
            x: originalX,
            y: originalY,
            dragStartX: undefined,
            dragStartY: undefined,
          });
        }
        return next;
      });
      
      // Attempt to use the item (will remove it on success)
      attemptUseItem(instanceId, itemData.item, 'drag-drop');
    } else {
      // Dropped elsewhere - check if we need to apply gravity
      const dropY = dragState.currentY;
      const isAboveGround = dropY < groundY;
      
      if (isAboveGround) {
        // Item is above ground - start falling from drop position
        const now = performance.now();
        setReleasedItems(prev => {
          const next = new Map(prev);
          const current = next.get(instanceId);
          if (current) {
            next.set(instanceId, {
              ...current,
              state: 'falling',
              x: dragState.currentX,
              y: dropY,
              startY: dropY,
              targetY: groundY,
              fallStartTime: now,
              dragStartX: undefined,
              dragStartY: undefined,
            });
          }
          return next;
        });
        
        // Start animation loop to handle the fall
        setTimeout(() => {
          runAnimationLoop();
        }, 0);
      } else {
        // Already at or below ground - just land it
        setReleasedItems(prev => {
          const next = new Map(prev);
          const current = next.get(instanceId);
          if (current) {
            next.set(instanceId, {
              ...current,
              state: 'landed',
              x: dragState.currentX,
              y: groundY, // Snap to ground
              dragStartX: undefined,
              dragStartY: undefined,
            });
          }
          return next;
        });
      }
    }
    
    // Reset drag state
    setDragState(initialDragState);
  }, [dragState, releasedItems, attemptUseItem, groundY, runAnimationLoop]);
  
  // Handle hanging item click - release one instance of the item
  const handleItemClick = useCallback((item: CompanionItem, xPosition: number) => {
    const now = performance.now();
    
    // Generate unique instance ID for this dropped item
    instanceCounterRef.current += 1;
    const instanceId = `${item.id}-${now}-${instanceCounterRef.current}`;
    
    // Increment the released count for this item type
    setReleasedCountByItemId(prev => {
      const next = new Map(prev);
      const currentCount = next.get(item.id) || 0;
      next.set(item.id, currentCount + 1);
      return next;
    });
    
    // Create released item data with unique instance ID
    const releasedData: ReleasedItemData = {
      instanceId,
      item,
      state: 'falling',
      x: xPosition,
      y: hangingBottomY - HANGING_CONFIG.circleSize / 2,
      startY: hangingBottomY - HANGING_CONFIG.circleSize / 2,
      targetY: groundY,
      fallStartTime: now,
    };
    
    // Add to released items (keyed by instanceId, not item.id)
    setReleasedItems(prev => {
      const next = new Map(prev);
      next.set(instanceId, releasedData);
      return next;
    });
    
    // Start animation loop immediately
    // Use setTimeout(0) to ensure state update is processed first
    setTimeout(() => {
      runAnimationLoop();
    }, 0);
    
    // Notify parent
    onItemRelease?.(item);
  }, [hangingBottomY, groundY, onItemRelease, runAnimationLoop]);
  
  // Manual pickup of landed item (clicking on it)
  const handleLandedItemClick = useCallback((instanceId: string, item: CompanionItem) => {
    // Use the async flow (same as contact)
    attemptUseItem(instanceId, item, 'click');
  }, [attemptUseItem]);
  
  // Calculate horizontal positions for items (centered)
  const totalWidth = (items.length - 1) * HANGING_CONFIG.itemSpacing;
  const startX = -totalWidth / 2;
  const getItemXPosition = (index: number) => {
    const viewportCenterX = window.innerWidth / 2;
    return viewportCenterX + startX + index * HANGING_CONFIG.itemSpacing;
  };
  
  // Calculate hanging items with their remaining quantities
  // An item appears in the hanging row if (quantity - releasedCount) > 0
  const hangingItems = items
    .map(item => {
      const releasedCount = releasedCountByItemId.get(item.id) || 0;
      const remainingQuantity = item.quantity - releasedCount;
      return { ...item, quantity: remainingQuantity };
    })
    .filter(item => item.quantity > 0);
  
  // Should we render the hanging container?
  const shouldRenderContainer = containerState !== 'hidden' || (isVisible && selectedAction);
  
  // Empty state (shown when action selected but no items)
  const showEmptyState = isVisible && selectedAction && items.length === 0;
  
  // Calculate slide offset based on container state
  const getSlideOffset = () => {
    switch (containerState) {
      case 'hidden':
        return -(HANGING_CONFIG.lineLength + HANGING_CONFIG.circleSize + 40);
      case 'opening':
        return 0;
      case 'closing':
        return -(HANGING_CONFIG.lineLength + HANGING_CONFIG.circleSize + 40);
      case 'open':
        return 0;
      default:
        return 0;
    }
  };
  
  return (
    <>
      {/* Empty state message */}
      {showEmptyState && (
        <div
          className={cn(
            "fixed left-1/2 -translate-x-1/2 top-8 pointer-events-auto",
            "transition-all duration-300",
            containerState === 'opening' || containerState === 'open' 
              ? "opacity-100 translate-y-0" 
              : "opacity-0 -translate-y-4"
          )}
          style={{ zIndex: 10003 }}
        >
          <div className="bg-background/95 backdrop-blur-sm rounded-2xl px-6 py-4 shadow-lg border">
            <p className="text-sm text-muted-foreground text-center">
              No {getMenuActionConfig(selectedAction)?.label.toLowerCase()} items in your inventory
            </p>
          </div>
        </div>
      )}
      
      {/* Hanging items container */}
      {shouldRenderContainer && items.length > 0 && (
        <div 
          className="fixed inset-x-0 top-0 flex justify-center pointer-events-none"
          style={{ 
            zIndex: 10003,
            transition: `transform ${HANGING_CONFIG.slideAnimationDuration}ms ease-out`,
            transform: `translateY(${getSlideOffset()}px)`,
          }}
        >
          {/* Container for positioning items relative to center */}
          <div 
            className="relative" 
            style={{ height: HANGING_CONFIG.lineLength + HANGING_CONFIG.circleSize + 20 }}
          >
            {hangingItems.map((item, index) => {
              // Find the original index for positioning
              const originalIndex = items.findIndex(i => i.id === item.id);
              const xOffset = startX + originalIndex * HANGING_CONFIG.itemSpacing;
              const delay = index * HANGING_CONFIG.staggerDelay;
              const itemX = getItemXPosition(originalIndex);
              
              return (
                <div
                  key={item.id}
                  className="absolute pointer-events-auto"
                  style={{
                    left: '50%',
                    transform: `translateX(calc(-50% + ${xOffset}px))`,
                  }}
                >
                  {/* Hanging line */}
                  <div
                    className="mx-auto"
                    style={{
                      width: HANGING_CONFIG.lineWidth,
                      height: HANGING_CONFIG.lineLength,
                      background: 'linear-gradient(to bottom, hsl(var(--muted-foreground) / 0.3), hsl(var(--muted-foreground) / 0.5))',
                      // Subtle sway animation when container is open
                      animation: containerState === 'open' 
                        ? `hanging-sway 3s ease-in-out ${delay}ms infinite` 
                        : undefined,
                      transformOrigin: 'top center',
                    }}
                  />
                  
                  {/* Item circle (hanging container) */}
                  <button
                    className={cn(
                      "relative flex items-center justify-center rounded-full",
                      "bg-background/95 backdrop-blur-sm",
                      "shadow-lg border-2 border-muted/30",
                      "transition-all duration-200",
                      "focus:outline-none focus:ring-2 focus:ring-primary/50",
                      "hover:scale-110 hover:shadow-xl hover:border-primary/30 active:scale-95",
                      "cursor-pointer"
                    )}
                    style={{
                      width: HANGING_CONFIG.circleSize,
                      height: HANGING_CONFIG.circleSize,
                      marginLeft: (HANGING_CONFIG.circleSize / 2) * -1 + HANGING_CONFIG.lineWidth / 2,
                    }}
                    onClick={() => handleItemClick(item, itemX)}
                    title={`${item.name} (x${item.quantity})`}
                    aria-label={`${item.name}, quantity ${item.quantity}. Click to release.`}
                  >
                    {/* Item emoji */}
                    <span 
                      className="select-none"
                      style={{ fontSize: HANGING_CONFIG.emojiSize }}
                      role="img"
                      aria-hidden="true"
                    >
                      {item.emoji}
                    </span>
                    
                    {/* Quantity badge */}
                    <span
                      className={cn(
                        "absolute -top-1 -right-1",
                        "flex items-center justify-center",
                        "bg-primary text-primary-foreground",
                        "text-xs font-semibold rounded-full",
                        "shadow-md"
                      )}
                      style={{
                        minWidth: HANGING_CONFIG.badgeSize,
                        height: HANGING_CONFIG.badgeSize,
                        padding: '0 5px',
                      }}
                    >
                      {item.quantity}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Visual feedback: Blobbi glow when item is being dragged over */}
      {dragState.isDragging && dragState.isOverBlobbi && companionPosition && (
        <div
          className="fixed rounded-full pointer-events-none animate-pulse"
          style={{
            left: companionPosition.x - 10,
            top: companionPosition.y - 10,
            width: companionSize + 20,
            height: companionSize + 20,
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.3) 0%, transparent 70%)',
            zIndex: 10002,
          }}
        />
      )}
      
      {/* Released items (falling, landed, and dragging) */}
      {Array.from(releasedItems.values()).map(data => (
        <ReleasedItem
          key={`released-${data.instanceId}`}
          data={data}
          isBeingUsed={itemsBeingUsedRef.current.has(data.instanceId)}
          dragState={dragState}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onCollect={handleLandedItemClick}
        />
      ))}
      
      {/* CSS animations */}
      <style>{`
        @keyframes hanging-sway {
          0%, 100% {
            transform: rotate(0deg);
          }
          25% {
            transform: rotate(1deg);
          }
          75% {
            transform: rotate(-1deg);
          }
        }
      `}</style>
    </>
  );
}
