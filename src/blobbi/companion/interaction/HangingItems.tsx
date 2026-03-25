/**
 * HangingItems
 * 
 * Displays inventory items as hanging elements from the top of the screen.
 * Each item appears as a circle connected to the top by a thin vertical line,
 * creating a playful, spatial feel.
 * 
 * State Model:
 * - Container states: hidden → opening → open → closing → hidden
 * - Item lifecycle: hanging → released (falling) → landed
 * 
 * Key Design Principle:
 * When an item is released, only the EMOJI falls - not the circle container.
 * The same visual element continues from falling to landed state (no respawn).
 * 
 * Features:
 * - Smooth open/close slide animations (items descend/ascend)
 * - Thin vertical lines from the top of screen
 * - Circular containers for hanging items
 * - Click releases item: circle disappears, emoji falls
 * - Continuous visual: same emoji from fall to ground
 * - Contact detection: items disappear when touching Blobbi
 * 
 * Future extensions:
 * - Drag landed items to Blobbi
 * - Blobbi attracted to nearby items
 * - Auto-use urgent items
 * - Item consumption effects
 * - Different animations per item category
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
type ReleasedItemState = 'falling' | 'landed';

/** Data for a released item (tracks its entire lifecycle after being clicked) */
interface ReleasedItemData {
  item: CompanionItem;
  state: ReleasedItemState;
  /** X position (center of item) */
  x: number;
  /** Current Y position (animated during fall, final position when landed) */
  y: number;
  /** Y position where item started falling */
  startY: number;
  /** Y position where item will land */
  targetY: number;
  /** Timestamp when fall started */
  fallStartTime: number;
}

/** Result of attempting to use an item */
interface ItemUseAttemptResult {
  /** Whether the item was successfully used */
  success: boolean;
  /** Error message if failed */
  error?: string;
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
  /** Callback when an item finishes falling and lands */
  onItemLanded?: (item: CompanionItem) => void;
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
  /** Duration of the fall animation (ms) */
  fallDuration: 600,
  /** Ground offset from bottom of viewport */
  defaultGroundOffset: 40,
  /** Size of quantity badge */
  badgeSize: 20,
  /** Size of landed item hitbox for contact detection */
  landedItemSize: 40,
  /** Contact detection radius (how close Blobbi needs to be) */
  contactRadius: 50,
};

// ─── Released Item Component ──────────────────────────────────────────────────

interface ReleasedItemProps {
  data: ReleasedItemData;
  /** Whether this item is currently being used (prevents interaction) */
  isBeingUsed?: boolean;
  onCollect?: (item: CompanionItem) => void;
}

/**
 * A released item that is either falling or has landed.
 * This is a single continuous visual element - just the emoji.
 * No circle container, no badge - just the item itself.
 */
function ReleasedItem({ data, isBeingUsed = false, onCollect }: ReleasedItemProps) {
  const { item, state, x, y } = data;
  
  const isFalling = state === 'falling';
  const isLanded = state === 'landed';
  const canInteract = isLanded && !isBeingUsed;
  
  return (
    <div
      className={cn(
        "fixed pointer-events-auto select-none",
        "transition-transform duration-100",
        // Hover effect only for interactable landed items
        canInteract && "hover:scale-125 cursor-pointer",
        // Falling items or items being used can't be interacted with
        (isFalling || isBeingUsed) && "pointer-events-none",
        // Pulse animation when being used
        isBeingUsed && "animate-pulse"
      )}
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        zIndex: isFalling ? 10004 : 10003,
        // Add subtle shadow for depth, reduce opacity when being used
        filter: isLanded ? 'drop-shadow(0 2px 3px rgba(0,0,0,0.2))' : 'drop-shadow(0 3px 6px rgba(0,0,0,0.25))',
        opacity: isBeingUsed ? 0.6 : 1,
      }}
      onClick={() => canInteract && onCollect?.(item)}
      role={canInteract ? 'button' : undefined}
      aria-label={canInteract ? `${item.name} on ground. Click to pick up.` : undefined}
    >
      <span
        style={{ 
          fontSize: HANGING_CONFIG.fallingEmojiSize,
          // Subtle rotation during fall for liveliness
          transform: isFalling ? 'rotate(-5deg)' : 'rotate(0deg)',
          transition: 'transform 100ms ease-out',
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
}: HangingItemsProps) {
  // Container animation state
  const [containerState, setContainerState] = useState<ContainerState>('hidden');
  
  // Track which items have been released (by ID) - these are no longer "hanging"
  const [releasedItemIds, setReleasedItemIds] = useState<Set<string>>(new Set());
  
  // Track items currently being used (to prevent double-use)
  const [itemsBeingUsed, setItemsBeingUsed] = useState<Set<string>>(new Set());
  
  // Track released items with their full state (falling/landed)
  const [releasedItems, setReleasedItems] = useState<Map<string, ReleasedItemData>>(new Map());
  
  // Animation frame ref for fall animation
  const animationRef = useRef<number | null>(null);
  
  // Ref to track if animation is running (to avoid duplicate loops)
  const isAnimatingRef = useRef(false);
  
  // Ref to access latest releasedItems in animation loop without re-triggering effect
  const releasedItemsRef = useRef<Map<string, ReleasedItemData>>(releasedItems);
  releasedItemsRef.current = releasedItems;
  
  // Ref for onItemLanded callback
  const onItemLandedRef = useRef(onItemLanded);
  onItemLandedRef.current = onItemLanded;
  
  // Calculate ground Y position (where items land)
  const groundY = viewportHeight - groundOffset - HANGING_CONFIG.landedItemSize / 2;
  
  // Calculate the Y position where hanging items are (bottom of circle)
  const hangingBottomY = HANGING_CONFIG.lineLength + HANGING_CONFIG.circleSize;
  
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
          const progress = Math.min(elapsed / HANGING_CONFIG.fallDuration, 1);
          
          // Easing function for natural fall (accelerate then slow)
          const easeProgress = progress < 0.8 
            ? Math.pow(progress / 0.8, 2) * 0.9
            : 0.9 + (progress - 0.8) / 0.2 * 0.1;
          
          const newY = data.startY + (data.targetY - data.startY) * easeProgress;
          
          if (progress >= 1) {
            // Landing complete
            updates.push({ id, data: { ...data, state: 'landed', y: data.targetY } });
            onItemLandedRef.current?.(data.item);
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
  }, []);
  
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
          // Clear released item IDs when closing (but keep released items on ground)
          setReleasedItemIds(new Set());
        }, HANGING_CONFIG.slideAnimationDuration);
        
        return () => clearTimeout(timer);
      }
    }
  }, [isVisible, selectedAction, containerState]);
  
  /**
   * Attempt to use an item (via contact or click).
   * Only removes the item from screen if use succeeds.
   */
  const attemptUseItem = useCallback(async (item: CompanionItem, source: 'contact' | 'click') => {
    // Prevent double-use while an operation is in progress
    if (itemsBeingUsed.has(item.id)) {
      return;
    }
    
    // Mark as being used
    setItemsBeingUsed(prev => new Set(prev).add(item.id));
    
    try {
      // If onItemUse is provided, use the async flow
      if (onItemUse) {
        console.log(`[HangingItems] Attempting to use item (${source}):`, item.name);
        const result = await onItemUse(item);
        
        if (result.success) {
          console.log(`[HangingItems] Item used successfully:`, item.name);
          // Remove from released items only on success
          setReleasedItems(prev => {
            const next = new Map(prev);
            next.delete(item.id);
            return next;
          });
        } else {
          console.log(`[HangingItems] Item use failed:`, item.name, result.error);
          // Item stays on screen - user can try again
        }
      } else {
        // Legacy behavior: call onItemCollected and remove immediately
        console.log(`[HangingItems] Item collected (legacy):`, item.name);
        onItemCollected?.(item);
        setReleasedItems(prev => {
          const next = new Map(prev);
          next.delete(item.id);
          return next;
        });
      }
    } finally {
      // Clear the "being used" state
      setItemsBeingUsed(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }, [itemsBeingUsed, onItemUse, onItemCollected]);
  
  // Contact detection with Blobbi
  useEffect(() => {
    if (!companionPosition) return;
    
    // Blobbi's center position
    const blobbiCenterX = companionPosition.x + companionSize / 2;
    const blobbiCenterY = companionPosition.y + companionSize / 2;
    
    // Check each landed item for contact
    releasedItems.forEach((data, id) => {
      // Skip items that are being used or are still falling
      if (data.state !== 'landed' || itemsBeingUsed.has(id)) {
        return;
      }
      
      // Calculate distance between Blobbi center and item center
      const dx = blobbiCenterX - data.x;
      const dy = blobbiCenterY - data.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Contact threshold is sum of radii
      const contactThreshold = companionSize / 2 + HANGING_CONFIG.contactRadius;
      
      if (distance < contactThreshold) {
        // Use the item via the async flow
        attemptUseItem(data.item, 'contact');
      }
    });
  }, [companionPosition, companionSize, releasedItems, itemsBeingUsed, attemptUseItem]);
  
  // Handle hanging item click - release the item
  const handleItemClick = useCallback((item: CompanionItem, xPosition: number) => {
    const now = performance.now();
    
    // Mark as released (removes from hanging display)
    setReleasedItemIds(prev => new Set(prev).add(item.id));
    
    // Create released item data
    const releasedData: ReleasedItemData = {
      item,
      state: 'falling',
      x: xPosition,
      y: hangingBottomY - HANGING_CONFIG.circleSize / 2,
      startY: hangingBottomY - HANGING_CONFIG.circleSize / 2,
      targetY: groundY,
      fallStartTime: now,
    };
    
    // Add to released items
    setReleasedItems(prev => {
      const next = new Map(prev);
      next.set(item.id, releasedData);
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
  const handleLandedItemClick = useCallback((item: CompanionItem) => {
    // Use the async flow (same as contact)
    attemptUseItem(item, 'click');
  }, [attemptUseItem]);
  
  // Calculate horizontal positions for items (centered)
  const totalWidth = (items.length - 1) * HANGING_CONFIG.itemSpacing;
  const startX = -totalWidth / 2;
  const getItemXPosition = (index: number) => {
    const viewportCenterX = window.innerWidth / 2;
    return viewportCenterX + startX + index * HANGING_CONFIG.itemSpacing;
  };
  
  // Filter items to only show those still hanging
  const hangingItems = items.filter(item => !releasedItemIds.has(item.id));
  
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
      
      {/* Released items (falling and landed) - rendered as continuous objects */}
      {Array.from(releasedItems.values()).map(data => (
        <ReleasedItem
          key={`released-${data.item.id}`}
          data={data}
          isBeingUsed={itemsBeingUsed.has(data.item.id)}
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
