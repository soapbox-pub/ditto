/**
 * CompanionActionMenu
 * 
 * Floating radial action menu that appears around Blobbi when clicked.
 * Actions are arranged in a curved arc above the companion.
 * 
 * Features:
 * - Radial/arc layout centered above Blobbi
 * - Smooth open/close animations
 * - Hover and active states
 * - Selected action highlight
 */

import { useMemo } from 'react';

import { cn } from '@/lib/utils';
import type { Position } from '../types/companion.types';
import type { CompanionMenuAction, MenuActionConfig } from './types';

interface CompanionActionMenuProps {
  /** Whether the menu is visible */
  isOpen: boolean;
  /** Position of Blobbi (top-left of the companion) */
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
}

// Layout configuration
const MENU_CONFIG = {
  /** Distance from companion center to action buttons */
  radius: 70,
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
 * Calculate button positions in an arc above the companion.
 */
function calculateArcPositions(
  centerX: number,
  centerY: number,
  count: number,
  config: typeof MENU_CONFIG
): Position[] {
  if (count === 0) return [];
  if (count === 1) {
    // Single button goes directly above
    const angleRad = (config.arcCenter * Math.PI) / 180;
    return [{
      x: centerX + Math.cos(angleRad) * config.radius,
      y: centerY + Math.sin(angleRad) * config.radius,
    }];
  }
  
  const positions: Position[] = [];
  const startAngle = config.arcCenter - config.arcSpread / 2;
  const angleStep = config.arcSpread / (count - 1);
  
  for (let i = 0; i < count; i++) {
    const angleDeg = startAngle + angleStep * i;
    const angleRad = (angleDeg * Math.PI) / 180;
    positions.push({
      x: centerX + Math.cos(angleRad) * config.radius,
      y: centerY + Math.sin(angleRad) * config.radius,
    });
  }
  
  return positions;
}

export function CompanionActionMenu({
  isOpen,
  companionPosition,
  companionSize,
  actions,
  selectedAction,
  onActionClick,
  onClickOutside,
}: CompanionActionMenuProps) {
  // Calculate companion center
  const companionCenter = useMemo(() => ({
    x: companionPosition.x + companionSize / 2,
    y: companionPosition.y + companionSize / 2,
  }), [companionPosition, companionSize]);
  
  // Calculate button positions
  const buttonPositions = useMemo(() => 
    calculateArcPositions(
      companionCenter.x,
      companionCenter.y,
      actions.length,
      MENU_CONFIG
    ),
    [companionCenter, actions.length]
  );
  
  if (!isOpen) return null;
  
  return (
    <>
      {/* Invisible backdrop for click outside detection */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 10001 }}
        onClick={onClickOutside}
        aria-hidden="true"
      />
      
      {/* Action buttons */}
      {actions.map((action, index) => {
        const position = buttonPositions[index];
        if (!position) return null;
        
        const isSelected = selectedAction === action.id;
        const delay = index * MENU_CONFIG.staggerDelay;
        
        return (
          <button
            key={action.id}
            className={cn(
              // Base styles
              "fixed flex items-center justify-center rounded-full",
              "shadow-lg transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-primary/50",
              // Background
              isSelected
                ? "bg-primary text-primary-foreground"
                : "bg-background/95 hover:bg-accent",
              // Hover effects
              "hover:scale-110 active:scale-95",
              // Animation
              "animate-in fade-in zoom-in-75"
            )}
            style={{
              left: position.x - MENU_CONFIG.buttonSize / 2,
              top: position.y - MENU_CONFIG.buttonSize / 2,
              width: MENU_CONFIG.buttonSize,
              height: MENU_CONFIG.buttonSize,
              zIndex: 10002,
              animationDelay: `${delay}ms`,
              animationFillMode: 'backwards',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onActionClick(action.id);
            }}
            title={action.label}
            aria-label={action.label}
          >
            <span 
              className="text-xl select-none"
              role="img"
              aria-hidden="true"
            >
              {action.emoji}
            </span>
          </button>
        );
      })}
    </>
  );
}
