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
 * - Large circular containers for hanging items
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
  /** Callback when an item is collected by Blobbi (contact) */
  onItemCollected?: (item: CompanionItem) => void;
}

// ─── Configuration ────────────────────────────────────────────────────────────

const HANGING_CONFIG = {
  /** Size of hanging item circles */
  circleSize: 72,
  /** Emoji font size for hanging items */
  emojiSize: '2.25rem',
  /** Emoji font size for falling/landed items (slightly larger for visibility) */
  fallingEmojiSize: '2.5rem',
  /** Horizontal spacing between items (center to center) */
  itemSpacing: 100,
  /** Length of the hanging line */
  lineLength: 120,
  /** Width of the hanging line */
  lineWidth: 2,
  /** Duration of open/close slide animation (ms) */
  slideAnimationDuration: 350,
  /** Stagger delay between items during open (ms) */
  staggerDelay: 40,
  /** Duration of the fall animation (ms) */
  fallDuration: 700,
  /** Ground offset from bottom of viewport */
  defaultGroundOffset: 40,
  /** Size of quantity badge */
  badgeSize: 24,
  /** Size of landed item hitbox for contact detection */
  landedItemSize: 48,
  /** Contact detection radius (how close Blobbi needs to be) */
  contactRadius: 60,
};

// ─── Released Item Component ──────────────────────────────────────────────────

interface ReleasedItemProps {
  data: ReleasedItemData;
  onCollect?: (item: CompanionItem) => void;
}

/**
 * A released item that is either falling or has landed.
 * This is a single continuous visual element - just the emoji.
 * No circle container, no badge - just the item itself.
 */
function ReleasedItem({ data, onCollect }: ReleasedItemProps) {
  const { item, state, x, y } = data;
  
  const isFalling = state === 'falling';
  const isLanded = state === 'landed';
  
  return (
    <div
      className={cn(
        "fixed pointer-events-auto select-none",
        "transition-transform duration-100",
        // Hover effect only for landed items
        isLanded && "hover:scale-125 cursor-pointer",
        // Falling items can't be interacted with
        isFalling && "pointer-events-none"
      )}
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        zIndex: isFalling ? 10004 : 10003,
        // Add subtle shadow for depth
        filter: isLanded ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' : 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
      }}
      onClick={() => isLanded && onCollect?.(item)}
      role={isLanded ? 'button' : undefined}
      aria-label={isLanded ? `${item.name} on ground. Click to pick up.` : undefined}
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
  companionSize = 80,
  onItemRelease,
  onItemLanded,
  onItemCollected,
}: HangingItemsProps) {
  // Container animation state
  const [containerState, setContainerState] = useState<ContainerState>('hidden');
  
  // Track which items have been released (by ID) - these are no longer "hanging"
  const [releasedItemIds, setReleasedItemIds] = useState<Set<string>>(new Set());
  
  // Track released items with their full state (falling/landed)
  const [releasedItems, setReleasedItems] = useState<Map<string, ReleasedItemData>>(new Map());
  
  // Animation frame ref for fall animation
  const animationRef = useRef<number>();
  
  // Calculate ground Y position (where items land)
  const groundY = viewportHeight - groundOffset - HANGING_CONFIG.landedItemSize / 2;
  
  // Calculate the Y position where hanging items are (bottom of circle)
  const hangingBottomY = HANGING_CONFIG.lineLength + HANGING_CONFIG.circleSize;
  
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
  
  // Animation loop for falling items
  useEffect(() => {
    const animate = () => {
      const now = performance.now();
      let hasChanges = false;
      let hasActiveFalls = false;
      
      setReleasedItems(prev => {
        const next = new Map(prev);
        
        for (const [id, data] of next) {
          if (data.state === 'falling') {
            hasActiveFalls = true;
            const elapsed = now - data.fallStartTime;
            const progress = Math.min(elapsed / HANGING_CONFIG.fallDuration, 1);
            
            // Easing function for natural fall (ease-in with bounce consideration)
            const easeProgress = progress < 0.8 
              ? Math.pow(progress / 0.8, 2) * 0.9  // Accelerate to 90%
              : 0.9 + (progress - 0.8) / 0.2 * 0.1; // Slow down final 10%
            
            const newY = data.startY + (data.targetY - data.startY) * easeProgress;
            
            if (progress >= 1) {
              // Landing complete
              next.set(id, { ...data, state: 'landed', y: data.targetY });
              hasChanges = true;
              // Notify parent of landing
              onItemLanded?.(data.item);
            } else if (Math.abs(newY - data.y) > 0.5) {
              // Update position during fall
              next.set(id, { ...data, y: newY });
              hasChanges = true;
            }
          }
        }
        
        return hasChanges ? next : prev;
      });
      
      if (hasActiveFalls) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    
    // Check if there are falling items
    const hasFallingItems = Array.from(releasedItems.values()).some(d => d.state === 'falling');
    if (hasFallingItems) {
      animationRef.current = requestAnimationFrame(animate);
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [releasedItems, onItemLanded]);
  
  // Contact detection with Blobbi
  useEffect(() => {
    if (!companionPosition) return;
    
    // Blobbi's center position
    const blobbiCenterX = companionPosition.x + companionSize / 2;
    const blobbiCenterY = companionPosition.y + companionSize / 2;
    
    // Check each landed item for contact
    const itemsToRemove: string[] = [];
    
    releasedItems.forEach((data, id) => {
      if (data.state === 'landed') {
        // Calculate distance between Blobbi center and item center
        const dx = blobbiCenterX - data.x;
        const dy = blobbiCenterY - data.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Contact threshold is sum of radii
        const contactThreshold = companionSize / 2 + HANGING_CONFIG.contactRadius;
        
        if (distance < contactThreshold) {
          itemsToRemove.push(id);
          console.log('[HangingItems] Item collected by Blobbi:', data.item.name);
          onItemCollected?.(data.item);
        }
      }
    });
    
    // Remove collected items
    if (itemsToRemove.length > 0) {
      setReleasedItems(prev => {
        const next = new Map(prev);
        itemsToRemove.forEach(id => next.delete(id));
        return next;
      });
    }
  }, [companionPosition, companionSize, releasedItems, onItemCollected]);
  
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
      y: hangingBottomY - HANGING_CONFIG.circleSize / 2, // Start from center of circle
      startY: hangingBottomY - HANGING_CONFIG.circleSize / 2,
      targetY: groundY,
      fallStartTime: now,
    };
    
    setReleasedItems(prev => {
      const next = new Map(prev);
      next.set(item.id, releasedData);
      return next;
    });
    
    // Notify parent
    onItemRelease?.(item);
  }, [hangingBottomY, groundY, onItemRelease]);
  
  // Manual pickup of landed item (clicking on it)
  const handleLandedItemClick = useCallback((item: CompanionItem) => {
    console.log('[HangingItems] Landed item manually picked up:', item.name);
    
    // Remove from released items
    setReleasedItems(prev => {
      const next = new Map(prev);
      next.delete(item.id);
      return next;
    });
    
    // Treat as collected
    onItemCollected?.(item);
  }, [onItemCollected]);
  
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
                        padding: '0 6px',
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
