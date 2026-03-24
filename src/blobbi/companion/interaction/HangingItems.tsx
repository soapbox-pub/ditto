/**
 * HangingItems
 * 
 * Displays inventory items as hanging elements from the top of the screen.
 * Each item appears as a circle connected to the top by a thin vertical line,
 * creating a playful, spatial feel.
 * 
 * State Model:
 * - Container states: hidden → opening → open → closing → hidden
 * - Item states: hanging → falling → landed
 * 
 * Features:
 * - Smooth open/close slide animations (items descend/ascend)
 * - Thin vertical lines from the top of screen
 * - Large circular item containers with emoji icons
 * - Quantity badges
 * - Click to release (line disappears, item falls to ground)
 * - Landed items remain visible on the ground
 * 
 * Future extensions:
 * - Drag landed items to Blobbi
 * - Blobbi attracted to nearby items
 * - Auto-use urgent items
 * - Item pickup/consumption
 * - Different animations per item category
 */

import { useState, useCallback, useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';
import type { CompanionItem, CompanionMenuAction } from './types';
import { getMenuActionConfig } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

/** State of the hanging items container */
type ContainerState = 'hidden' | 'opening' | 'open' | 'closing';

/** State of an individual item */
type ItemState = 'hanging' | 'falling' | 'landed';

/** Internal state for each item */
interface ItemStateData {
  id: string;
  state: ItemState;
  /** Position when item started falling (for calculating ground position) */
  fallStartX?: number;
  /** Y position where item lands (ground level) */
  landedY?: number;
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
  /** Callback when an item is clicked/released */
  onItemRelease?: (item: CompanionItem) => void;
  /** Callback when an item finishes falling and lands */
  onItemLanded?: (item: CompanionItem) => void;
}

// ─── Configuration ────────────────────────────────────────────────────────────

const HANGING_CONFIG = {
  /** Size of item circles (increased for better visibility) */
  circleSize: 72,
  /** Emoji font size */
  emojiSize: '2.25rem', // text-4xl equivalent
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
  fallDuration: 600,
  /** Ground offset from bottom of viewport */
  defaultGroundOffset: 40,
  /** Size of quantity badge */
  badgeSize: 24,
};

// ─── Landed Item Component ────────────────────────────────────────────────────

interface LandedItemProps {
  item: CompanionItem;
  xPosition: number;
  groundY: number;
  onPickup?: (item: CompanionItem) => void;
}

/**
 * A landed item that rests on the ground after falling.
 * Rendered separately from hanging items to persist after menu closes.
 */
function LandedItem({ item, xPosition, groundY, onPickup }: LandedItemProps) {
  return (
    <button
      className={cn(
        "fixed flex items-center justify-center rounded-full pointer-events-auto",
        "bg-background/95 backdrop-blur-sm",
        "shadow-lg border-2 border-muted/30",
        "transition-all duration-200",
        "hover:scale-110 hover:shadow-xl hover:border-primary/30 active:scale-95",
        "cursor-pointer",
        "animate-in fade-in zoom-in-90 duration-200"
      )}
      style={{
        width: HANGING_CONFIG.circleSize,
        height: HANGING_CONFIG.circleSize,
        left: xPosition - HANGING_CONFIG.circleSize / 2,
        top: groundY - HANGING_CONFIG.circleSize,
        zIndex: 10003,
      }}
      onClick={() => onPickup?.(item)}
      title={`${item.name} (x${item.quantity}) - Click to pick up`}
      aria-label={`${item.name} on ground, quantity ${item.quantity}. Click to pick up.`}
    >
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
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function HangingItems({
  isVisible,
  selectedAction,
  items,
  viewportHeight = window.innerHeight,
  groundOffset = HANGING_CONFIG.defaultGroundOffset,
  onItemRelease,
  onItemLanded,
}: HangingItemsProps) {
  // Container animation state
  const [containerState, setContainerState] = useState<ContainerState>('hidden');
  
  // Track state of each item
  const [itemStates, setItemStates] = useState<Map<string, ItemStateData>>(new Map());
  
  // Track landed items with their positions (persists after menu closes)
  const [landedItems, setLandedItems] = useState<Map<string, { item: CompanionItem; x: number }>>( new Map());
  
  // Reference to track if we should animate (prevents animation on initial mount)
  const hasBeenVisible = useRef(false);
  
  // Calculate ground Y position
  const groundY = viewportHeight - groundOffset;
  
  // Handle visibility changes with animation
  useEffect(() => {
    if (isVisible && selectedAction) {
      // Opening
      if (containerState === 'hidden' || containerState === 'closing') {
        setContainerState('opening');
        hasBeenVisible.current = true;
        
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
          // Clear hanging item states (but keep landed items)
          setItemStates(new Map());
        }, HANGING_CONFIG.slideAnimationDuration);
        
        return () => clearTimeout(timer);
      }
    }
  }, [isVisible, selectedAction, containerState]);
  
  // Handle item click - starts the falling animation
  const handleItemClick = useCallback((item: CompanionItem, xPosition: number) => {
    // Update state to falling with position info
    setItemStates(prev => {
      const next = new Map(prev);
      next.set(item.id, { 
        id: item.id, 
        state: 'falling',
        fallStartX: xPosition,
        landedY: groundY,
      });
      return next;
    });
    
    // Notify parent
    onItemRelease?.(item);
    
    // After fall animation completes, move to landed state
    setTimeout(() => {
      setItemStates(prev => {
        const next = new Map(prev);
        const current = next.get(item.id);
        if (current) {
          next.set(item.id, { ...current, state: 'landed' });
        }
        return next;
      });
      
      // Add to landed items collection
      setLandedItems(prev => {
        const next = new Map(prev);
        next.set(item.id, { item, x: xPosition });
        return next;
      });
      
      onItemLanded?.(item);
    }, HANGING_CONFIG.fallDuration);
  }, [groundY, onItemRelease, onItemLanded]);
  
  // Get current state for an item
  const getItemState = (itemId: string): ItemState => {
    return itemStates.get(itemId)?.state ?? 'hanging';
  };
  
  // Handle picking up a landed item (placeholder for future)
  const handleLandedItemPickup = useCallback((item: CompanionItem) => {
    // For now, just log - actual pickup/use will be implemented later
    console.log('[HangingItems] Landed item clicked:', item);
  }, []);
  
  // Calculate horizontal positions for items (centered)
  const totalWidth = (items.length - 1) * HANGING_CONFIG.itemSpacing;
  const startX = -totalWidth / 2;
  const getItemXPosition = (index: number) => {
    const viewportCenterX = window.innerWidth / 2;
    return viewportCenterX + startX + index * HANGING_CONFIG.itemSpacing;
  };
  
  // Don't render container if fully hidden and no action selected
  const shouldRenderContainer = containerState !== 'hidden' || (isVisible && selectedAction);
  
  // Empty state (shown when action selected but no items)
  const showEmptyState = isVisible && selectedAction && items.length === 0;
  
  // Calculate slide offset based on container state
  const getSlideOffset = () => {
    switch (containerState) {
      case 'hidden':
        return -(HANGING_CONFIG.lineLength + HANGING_CONFIG.circleSize + 40);
      case 'opening':
      case 'closing':
        return containerState === 'opening' ? 0 : -(HANGING_CONFIG.lineLength + HANGING_CONFIG.circleSize + 40);
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
            {items.map((item, index) => {
              const state = getItemState(item.id);
              const xOffset = startX + index * HANGING_CONFIG.itemSpacing;
              const delay = index * HANGING_CONFIG.staggerDelay;
              const itemX = getItemXPosition(index);
              
              // Don't render landed items here (they're rendered separately below)
              if (state === 'landed') {
                return null;
              }
              
              const isFalling = state === 'falling';
              const isHanging = state === 'hanging';
              
              return (
                <div
                  key={item.id}
                  className="absolute pointer-events-auto"
                  style={{
                    left: '50%',
                    transform: `translateX(calc(-50% + ${xOffset}px))`,
                  }}
                >
                  {/* Hanging line - hidden when falling */}
                  <div
                    className={cn(
                      "mx-auto transition-opacity duration-150",
                      isFalling ? "opacity-0" : "opacity-100"
                    )}
                    style={{
                      width: HANGING_CONFIG.lineWidth,
                      height: HANGING_CONFIG.lineLength,
                      background: 'linear-gradient(to bottom, hsl(var(--muted-foreground) / 0.3), hsl(var(--muted-foreground) / 0.5))',
                      // Subtle sway animation when hanging
                      animation: isHanging && containerState === 'open' 
                        ? `hanging-sway 3s ease-in-out ${delay}ms infinite` 
                        : undefined,
                      transformOrigin: 'top center',
                    }}
                  />
                  
                  {/* Item circle */}
                  <button
                    className={cn(
                      "relative flex items-center justify-center rounded-full",
                      "bg-background/95 backdrop-blur-sm",
                      "shadow-lg border-2 border-muted/30",
                      "transition-all duration-200",
                      "focus:outline-none focus:ring-2 focus:ring-primary/50",
                      // Only show hover effects when hanging
                      isHanging && "hover:scale-110 hover:shadow-xl hover:border-primary/30 active:scale-95",
                      // Cursor
                      isFalling ? "cursor-default" : "cursor-pointer"
                    )}
                    style={{
                      width: HANGING_CONFIG.circleSize,
                      height: HANGING_CONFIG.circleSize,
                      marginLeft: (HANGING_CONFIG.circleSize / 2) * -1 + HANGING_CONFIG.lineWidth / 2,
                      // Fall animation when released
                      animation: isFalling 
                        ? `item-fall-to-ground ${HANGING_CONFIG.fallDuration}ms ease-in forwards`
                        : undefined,
                      // CSS variable for ground distance
                      '--fall-distance': `${groundY - HANGING_CONFIG.lineLength - HANGING_CONFIG.circleSize}px`,
                    } as React.CSSProperties}
                    onClick={() => isHanging && handleItemClick(item, itemX)}
                    disabled={isFalling}
                    title={`${item.name} (x${item.quantity})`}
                    aria-label={`${item.name}, quantity ${item.quantity}. Click to use.`}
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
                        "shadow-md",
                        // Fade out badge when falling
                        isFalling && "opacity-0 transition-opacity duration-150"
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
      
      {/* Landed items (persist even after menu closes) */}
      {Array.from(landedItems.values()).map(({ item, x }) => (
        <LandedItem
          key={`landed-${item.id}`}
          item={item}
          xPosition={x}
          groundY={groundY}
          onPickup={handleLandedItemPickup}
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
        
        @keyframes item-fall-to-ground {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          15% {
            transform: translateY(30px) rotate(-8deg);
          }
          30% {
            transform: translateY(80px) rotate(5deg);
          }
          50% {
            transform: translateY(180px) rotate(-3deg);
          }
          70% {
            transform: translateY(320px) rotate(2deg);
          }
          85% {
            opacity: 1;
          }
          100% {
            transform: translateY(var(--fall-distance)) rotate(0deg);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}
