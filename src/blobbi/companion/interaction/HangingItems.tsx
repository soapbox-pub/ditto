/**
 * HangingItems
 * 
 * Displays inventory items as hanging elements from the top of the screen.
 * Each item appears as a circle connected to the top by a thin vertical line,
 * creating a playful, spatial feel.
 * 
 * Features:
 * - Thin vertical lines from the top of screen
 * - Circular item containers with emoji icons
 * - Quantity badges
 * - Staggered entrance animation
 * - Click to release (line disappears, item falls)
 * 
 * Future extensions:
 * - Drag items to drop on Blobbi
 * - Blobbi attracted to nearby items
 * - Auto-use urgent items
 * - Different animations per item category
 */

import { useState, useCallback } from 'react';

import { cn } from '@/lib/utils';
import type { CompanionItem, CompanionMenuAction } from './types';
import { getMenuActionConfig } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

/** State of a hanging item */
type HangingItemState = 'hanging' | 'falling' | 'landed';

/** Internal state for each item */
interface ItemState {
  id: string;
  state: HangingItemState;
}

/** Props for the HangingItems component */
interface HangingItemsProps {
  /** Whether to show the hanging items */
  isVisible: boolean;
  /** The selected action (for empty state messaging) */
  selectedAction: CompanionMenuAction | null;
  /** Items to display */
  items: CompanionItem[];
  /** Callback when an item is clicked/released */
  onItemRelease?: (item: CompanionItem) => void;
  /** Callback when an item finishes falling */
  onItemLanded?: (item: CompanionItem) => void;
}

// ─── Configuration ────────────────────────────────────────────────────────────

const HANGING_CONFIG = {
  /** Size of item circles */
  circleSize: 52,
  /** Horizontal spacing between items (center to center) */
  itemSpacing: 80,
  /** Length of the hanging line */
  lineLength: 100,
  /** Width of the hanging line */
  lineWidth: 2,
  /** Stagger delay between item appearances (ms) */
  staggerDelay: 60,
  /** Duration of the fall animation (ms) */
  fallDuration: 800,
  /** How far below viewport the item falls to */
  fallDistance: 600,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function HangingItems({
  isVisible,
  selectedAction,
  items,
  onItemRelease,
  onItemLanded,
}: HangingItemsProps) {
  // Track state of each item (hanging, falling, landed)
  const [itemStates, setItemStates] = useState<Map<string, ItemState>>(new Map());
  
  // Handle item click - starts the falling animation
  const handleItemClick = useCallback((item: CompanionItem) => {
    // Update state to falling
    setItemStates(prev => {
      const next = new Map(prev);
      next.set(item.id, { id: item.id, state: 'falling' });
      return next;
    });
    
    // Notify parent
    onItemRelease?.(item);
    
    // After fall animation completes, mark as landed
    setTimeout(() => {
      setItemStates(prev => {
        const next = new Map(prev);
        next.set(item.id, { id: item.id, state: 'landed' });
        return next;
      });
      onItemLanded?.(item);
    }, HANGING_CONFIG.fallDuration);
  }, [onItemRelease, onItemLanded]);
  
  // Get current state for an item
  const getItemState = (itemId: string): HangingItemState => {
    return itemStates.get(itemId)?.state ?? 'hanging';
  };
  
  // Don't render if not visible
  if (!isVisible || !selectedAction) {
    return null;
  }
  
  // Empty state
  if (items.length === 0) {
    const actionConfig = getMenuActionConfig(selectedAction);
    return (
      <div
        className="fixed left-1/2 -translate-x-1/2 top-8 animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto"
        style={{ zIndex: 10003 }}
      >
        <div className="bg-background/95 backdrop-blur-sm rounded-2xl px-6 py-4 shadow-lg border">
          <p className="text-sm text-muted-foreground text-center">
            No {actionConfig?.label.toLowerCase()} items in your inventory
          </p>
        </div>
      </div>
    );
  }
  
  // Calculate horizontal positions for items (centered)
  const totalWidth = (items.length - 1) * HANGING_CONFIG.itemSpacing;
  const startX = -totalWidth / 2;
  
  return (
    <div 
      className="fixed inset-x-0 top-0 flex justify-center pointer-events-none"
      style={{ zIndex: 10003 }}
    >
      {/* Container for positioning items relative to center */}
      <div className="relative" style={{ height: HANGING_CONFIG.lineLength + HANGING_CONFIG.circleSize + 20 }}>
        {items.map((item, index) => {
          const state = getItemState(item.id);
          const xOffset = startX + index * HANGING_CONFIG.itemSpacing;
          const delay = index * HANGING_CONFIG.staggerDelay;
          
          // Don't render landed items
          if (state === 'landed') {
            return null;
          }
          
          const isFalling = state === 'falling';
          
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
                  // Entrance animation
                  animation: !isFalling ? `hanging-line-in 400ms ease-out ${delay}ms backwards` : undefined,
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
                  !isFalling && "hover:scale-110 hover:shadow-xl hover:border-primary/30 active:scale-95",
                  // Cursor
                  isFalling ? "cursor-default" : "cursor-pointer"
                )}
                style={{
                  width: HANGING_CONFIG.circleSize,
                  height: HANGING_CONFIG.circleSize,
                  marginLeft: (HANGING_CONFIG.circleSize / 2) * -1 + HANGING_CONFIG.lineWidth / 2,
                  // Entrance animation (when hanging)
                  animation: !isFalling 
                    ? `hanging-circle-in 400ms ease-out ${delay}ms backwards`
                    : `item-fall ${HANGING_CONFIG.fallDuration}ms ease-in forwards`,
                }}
                onClick={() => !isFalling && handleItemClick(item)}
                disabled={isFalling}
                title={`${item.name} (x${item.quantity})`}
                aria-label={`${item.name}, quantity ${item.quantity}. Click to use.`}
              >
                {/* Item emoji */}
                <span 
                  className="text-2xl select-none"
                  role="img"
                  aria-hidden="true"
                >
                  {item.emoji}
                </span>
                
                {/* Quantity badge */}
                <span
                  className={cn(
                    "absolute -top-1 -right-1",
                    "min-w-[20px] h-5 px-1.5",
                    "flex items-center justify-center",
                    "bg-primary text-primary-foreground",
                    "text-xs font-semibold rounded-full",
                    "shadow-md",
                    // Hide badge when falling
                    isFalling && "opacity-0 transition-opacity duration-150"
                  )}
                >
                  {item.quantity}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      
      {/* CSS animations */}
      <style>{`
        @keyframes hanging-line-in {
          from {
            transform: scaleY(0);
            transform-origin: top;
          }
          to {
            transform: scaleY(1);
            transform-origin: top;
          }
        }
        
        @keyframes hanging-circle-in {
          from {
            opacity: 0;
            transform: scale(0.5);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        @keyframes item-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          20% {
            transform: translateY(20px) rotate(-5deg);
          }
          100% {
            transform: translateY(${HANGING_CONFIG.fallDistance}px) rotate(15deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
