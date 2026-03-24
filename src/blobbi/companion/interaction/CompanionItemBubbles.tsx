/**
 * CompanionItemBubbles
 * 
 * Floating item bubbles that appear near the top of the screen
 * when an action is selected from the companion menu.
 * 
 * Features:
 * - Horizontal row of item bubbles
 * - Shows emoji and quantity badge
 * - Smooth appearance animation
 * - Clickable (for future item use)
 * 
 * Future extensions:
 * - Falling animation toward Blobbi
 * - Drag to drop on Blobbi
 * - Blobbi reaction when item is near
 */

import { cn } from '@/lib/utils';
import type { CompanionItem, CompanionMenuAction } from './types';
import { getMenuActionConfig } from './types';

interface CompanionItemBubblesProps {
  /** Whether the bubbles are visible */
  isVisible: boolean;
  /** Selected action (used for header/context) */
  selectedAction: CompanionMenuAction | null;
  /** Items to display */
  items: CompanionItem[];
  /** Callback when an item bubble is clicked */
  onItemClick?: (item: CompanionItem) => void;
  /** Callback to close the bubbles */
  onClose?: () => void;
}

// Layout configuration
const BUBBLES_CONFIG = {
  /** Bubble size */
  bubbleSize: 56,
  /** Gap between bubbles */
  gap: 12,
  /** Top margin from viewport */
  topMargin: 80,
  /** Animation stagger delay (ms) */
  staggerDelay: 40,
};

export function CompanionItemBubbles({
  isVisible,
  selectedAction,
  items,
  onItemClick,
  onClose,
}: CompanionItemBubblesProps) {
  if (!isVisible || !selectedAction || items.length === 0) {
    // Show empty state if action selected but no items
    if (isVisible && selectedAction && items.length === 0) {
      const actionConfig = getMenuActionConfig(selectedAction);
      return (
        <div
          className="fixed left-1/2 -translate-x-1/2 animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto"
          style={{
            top: BUBBLES_CONFIG.topMargin,
            zIndex: 10003,
          }}
        >
          <div className="bg-background/95 backdrop-blur-sm rounded-2xl px-6 py-4 shadow-lg border">
            <p className="text-sm text-muted-foreground text-center">
              No {actionConfig?.label.toLowerCase()} items in your inventory
            </p>
          </div>
        </div>
      );
    }
    return null;
  }
  
  const actionConfig = getMenuActionConfig(selectedAction);
  
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto"
      style={{
        top: BUBBLES_CONFIG.topMargin,
        zIndex: 10003,
      }}
    >
      {/* Container with subtle background */}
      <div className="bg-background/90 backdrop-blur-sm rounded-2xl p-4 shadow-xl border">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-sm font-medium text-muted-foreground">
            {actionConfig?.emoji} {actionConfig?.label}
          </span>
          <button
            onClick={onClose}
            className="text-muted-foreground/60 hover:text-foreground transition-colors p-1"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Item bubbles row */}
        <div 
          className="flex items-center justify-center"
          style={{ gap: BUBBLES_CONFIG.gap }}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              className={cn(
                // Base styles
                "relative flex items-center justify-center rounded-full",
                "bg-accent/80 hover:bg-accent",
                "shadow-md transition-all duration-200",
                "focus:outline-none focus:ring-2 focus:ring-primary/50",
                // Hover effects
                "hover:scale-110 hover:shadow-lg active:scale-95",
                // Animation
                "animate-in fade-in zoom-in-75"
              )}
              style={{
                width: BUBBLES_CONFIG.bubbleSize,
                height: BUBBLES_CONFIG.bubbleSize,
                animationDelay: `${index * BUBBLES_CONFIG.staggerDelay}ms`,
                animationFillMode: 'backwards',
              }}
              onClick={() => onItemClick?.(item)}
              title={`${item.name} (x${item.quantity})`}
              aria-label={`${item.name}, quantity ${item.quantity}`}
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
                  "min-w-[20px] h-5 px-1",
                  "flex items-center justify-center",
                  "bg-primary text-primary-foreground",
                  "text-xs font-medium rounded-full",
                  "shadow-sm"
                )}
              >
                {item.quantity}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
