/**
 * CompanionActionMenu
 * 
 * Floating radial action menu that appears around Blobbi when clicked.
 * Actions are arranged in a curved arc above the companion.
 * 
 * IMPORTANT: This component calculates positions directly from props
 * on every render to ensure the menu stays perfectly attached to Blobbi
 * during all animations (idle, walking, floating, dragging, etc.).
 * 
 * Features:
 * - Radial/arc layout centered above Blobbi
 * - Real-time position tracking (no lag)
 * - Smooth open/close animations
 * - Hover and active states
 * - Selected action highlight
 */

import { cn } from '@/lib/utils';
import type { Position } from '../types/companion.types';
import type { CompanionMenuAction, MenuActionConfig } from './types';

interface CompanionActionMenuProps {
  /** Whether the menu is visible */
  isOpen: boolean;
  /** Position of Blobbi (top-left of the companion) - updates every frame */
  companionPosition: Position;
  /** Size of the companion */
  companionSize: number;
  /** Available actions to display */
  actions: MenuActionConfig[];
  /** Currently selected action */
  selectedAction: CompanionMenuAction | null;
  /** Callback when an action is clicked */
  onActionClick: (action: CompanionMenuAction) => void;
  /** Callback for clicking outside the menu */
  onClickOutside?: () => void;
  /** Whether Blobbi is currently sleeping (affects sleep button label) */
  isSleeping?: boolean;
}

// Layout configuration
const MENU_CONFIG = {
  /** Distance from companion center to action buttons (increased for larger Blobbi) */
  radius: 85,
  /** Size of action buttons */
  buttonSize: 44,
  /** Arc spread angle in degrees (total arc width) */
  arcSpread: 140,
  /** Arc center angle in degrees (270 = directly above) */
  arcCenter: 270,
  /** Animation stagger delay between buttons (ms) */
  staggerDelay: 30,
};

/**
 * Calculate button position for a single action in the arc.
 * This is called per-button directly in render to avoid stale position values.
 */
function calculateButtonPosition(
  centerX: number,
  centerY: number,
  index: number,
  count: number,
  config: typeof MENU_CONFIG
): Position {
  if (count === 1) {
    // Single button goes directly above
    const angleRad = (config.arcCenter * Math.PI) / 180;
    return {
      x: centerX + Math.cos(angleRad) * config.radius,
      y: centerY + Math.sin(angleRad) * config.radius,
    };
  }
  
  const startAngle = config.arcCenter - config.arcSpread / 2;
  const angleStep = config.arcSpread / (count - 1);
  const angleDeg = startAngle + angleStep * index;
  const angleRad = (angleDeg * Math.PI) / 180;
  
  return {
    x: centerX + Math.cos(angleRad) * config.radius,
    y: centerY + Math.sin(angleRad) * config.radius,
  };
}

export function CompanionActionMenu({
  isOpen,
  companionPosition,
  companionSize,
  actions,
  selectedAction,
  onActionClick,
  onClickOutside,
  isSleeping = false,
}: CompanionActionMenuProps) {
  if (!isOpen) return null;
  
  // Calculate companion center directly (no memoization to avoid stale values)
  const companionCenterX = companionPosition.x + companionSize / 2;
  const companionCenterY = companionPosition.y + companionSize / 2;
  
  return (
    <>
      {/* Invisible backdrop for click outside detection */}
      {/* pointer-events-auto is needed because parent layer has pointer-events-none */}
      <div
        className="fixed inset-0 pointer-events-auto"
        style={{ zIndex: 10001 }}
        onClick={onClickOutside}
        aria-hidden="true"
      />
      
      {/* Action buttons - positions calculated directly each render */}
      {actions.map((action, index) => {
        // Calculate position directly per button (no memoization = no lag)
        const position = calculateButtonPosition(
          companionCenterX,
          companionCenterY,
          index,
          actions.length,
          MENU_CONFIG
        );
        
        const isSelected = selectedAction === action.id;
        const delay = index * MENU_CONFIG.staggerDelay;
        
        // Sleep action toggles label/emoji based on sleeping state
        const isSleepAction = action.id === 'sleep';
        const displayEmoji = isSleepAction && isSleeping ? '\u2600\uFE0F' : action.emoji;
        const displayLabel = isSleepAction && isSleeping ? 'Wake up' : action.label;
        
        return (
          <button
            key={action.id}
            className={cn(
              // Base styles - pointer-events-auto needed because parent has pointer-events-none
              "fixed flex items-center justify-center rounded-full pointer-events-auto",
              "shadow-lg transition-colors duration-200",
              "focus:outline-none focus:ring-2 focus:ring-primary/50",
              // Background
              isSelected
                ? "bg-primary text-primary-foreground"
                : "bg-background/95 hover:bg-accent",
              // Hover effects (only scale, not position-affecting)
              "hover:scale-110 active:scale-95",
              // Animation
              "animate-in fade-in zoom-in-75"
            )}
            style={{
              // Position directly from calculation (updates every render)
              left: position.x - MENU_CONFIG.buttonSize / 2,
              top: position.y - MENU_CONFIG.buttonSize / 2,
              width: MENU_CONFIG.buttonSize,
              height: MENU_CONFIG.buttonSize,
              zIndex: 10002,
              animationDelay: `${delay}ms`,
              animationFillMode: 'backwards',
              // Use transform for smooth visual feedback without affecting position calculation
              transition: 'transform 200ms, background-color 200ms, color 200ms',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onActionClick(action.id);
            }}
            title={displayLabel}
            aria-label={displayLabel}
          >
            <span 
              className="text-xl select-none"
              role="img"
              aria-hidden="true"
            >
              {displayEmoji}
            </span>
          </button>
        );
      })}
    </>
  );
}
