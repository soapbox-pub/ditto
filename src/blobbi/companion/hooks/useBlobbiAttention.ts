/**
 * useBlobbiAttention Hook
 * 
 * Manages attention events for the companion - allowing the companion to
 * react to UI changes like modals, dialogs, sheets, and other overlay elements.
 * 
 * Architecture:
 * - Observes DOM for new UI elements (modals, dialogs, sheets, popovers)
 * - Creates attention targets when new elements appear
 * - Attention targets have priority and duration
 * - Higher priority targets override current behavior
 * - After duration expires, companion returns to normal behavior
 * 
 * Future extensibility:
 * - Add attention types (video, audio, notification) with different behaviors
 * - Add attention intensity levels affecting reaction strength
 * - Add attention chaining for sequential focus events
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

import type { AttentionTarget, AttentionPriority, Position } from '../types/companion.types';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';
import { useTypingAttention } from './useTypingAttention';

interface UseBlobbiAttentionOptions {
  /** Whether attention system should be active */
  isActive: boolean;
  /** Callback when a new attention target is triggered */
  onAttentionStart?: (target: AttentionTarget) => void;
  /** Callback when attention ends */
  onAttentionEnd?: (targetId: string) => void;
}

interface UseBlobbiAttentionResult {
  /** Current attention target, if any (includes typing attention) */
  currentAttention: AttentionTarget | null;
  /** Manually trigger attention to a position */
  triggerAttention: (position: Position, options?: TriggerOptions) => void;
  /** Clear current attention */
  clearAttention: () => void;
  /** Whether user is currently typing in a modal text field */
  isTypingInModal: boolean;
}

interface TriggerOptions {
  duration?: number;
  priority?: AttentionPriority;
  source?: string;
  /** If true, uses shorter glance cooldown instead of default cooldown */
  isGlance?: boolean;
}

// Selectors for UI elements that should trigger full attention (overlays)
const UI_OVERLAY_SELECTORS = [
  // Radix UI primitives (used by shadcn/ui)
  '[data-radix-dialog-content]',
  '[data-radix-alert-dialog-content]',
  '[data-radix-popover-content]',
  '[data-radix-dropdown-menu-content]',
  '[data-radix-context-menu-content]',
  '[data-radix-hover-card-content]',
  '[data-radix-navigation-menu-content]',
  // Vaul drawer
  '[data-vaul-drawer]',
  // Common modal/dialog patterns
  '[role="dialog"]',
  '[role="alertdialog"]',
  // Sheet/drawer patterns
  '[data-state="open"][data-side]',
];

// Selectors for tab elements that trigger brief glances
// These are more targeted to avoid triggering on every tab-like element
const TAB_SELECTORS = [
  // Radix UI tabs (used by shadcn/ui)
  '[data-radix-tabs-content][data-state="active"]',
  // Main navigation/feed tabs specifically
  '[role="tabpanel"][data-state="active"]',
];

// Tooltip selector (very low priority, often ignored)
const TOOLTIP_SELECTOR = '[data-radix-tooltip-content]';

/**
 * Calculate the center position of an element.
 */
function getElementCenter(element: Element): Position {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/**
 * Check if an element is a UI overlay we should attend to (full attention).
 */
function isOverlayElement(element: Element): boolean {
  return UI_OVERLAY_SELECTORS.some(selector => element.matches(selector));
}

/**
 * Check if an element is a tab content that just became active (glance).
 */
function isTabElement(element: Element): boolean {
  return TAB_SELECTORS.some(selector => element.matches(selector));
}

/**
 * Check if an element is a tooltip (very low priority).
 */
function isTooltipElement(element: Element): boolean {
  return element.matches(TOOLTIP_SELECTOR);
}

/**
 * Generate a unique ID for attention events.
 */
function generateAttentionId(): string {
  return `attention-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Hook to manage companion attention to UI changes.
 */
export function useBlobbiAttention({
  isActive,
  onAttentionStart,
  onAttentionEnd,
}: UseBlobbiAttentionOptions): UseBlobbiAttentionResult {
  const [uiAttention, setUiAttention] = useState<AttentionTarget | null>(null);
  
  const config = DEFAULT_COMPANION_CONFIG;
  const lastAttentionTimeRef = useRef<number>(0);
  const attentionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  
  // Typing attention - detects when user is typing in modal text fields
  const { typingTarget, isTyping: isTypingInModal } = useTypingAttention({
    isActive,
  });
  
  /**
   * Clear UI attention and any pending timeouts.
   * Note: Typing attention clears itself via its own timeout.
   */
  const clearAttention = useCallback(() => {
    if (attentionTimeoutRef.current) {
      clearTimeout(attentionTimeoutRef.current);
      attentionTimeoutRef.current = null;
    }
    
    setUiAttention(prev => {
      if (prev) {
        onAttentionEnd?.(prev.id);
      }
      return null;
    });
  }, [onAttentionEnd]);
  
  /**
   * Manually trigger attention to a specific position.
   */
  const triggerAttention = useCallback((
    position: Position,
    options: TriggerOptions = {}
  ) => {
    const now = Date.now();
    const timeSinceLastAttention = now - lastAttentionTimeRef.current;
    
    const {
      duration = config.attention.defaultDuration,
      priority = 'normal',
      source,
      isGlance = false,
    } = options;
    
    // Respect cooldown to avoid spamming (shorter cooldown for glances)
    const cooldown = isGlance ? config.attention.glanceCooldown : config.attention.cooldown;
    if (timeSinceLastAttention < cooldown) {
      return;
    }
    
    // If there's current UI attention, check priority
    if (uiAttention) {
      const priorityOrder: Record<AttentionPriority, number> = {
        low: 0,
        normal: 1,
        high: 2,
      };
      
      if (priorityOrder[priority] < priorityOrder[uiAttention.priority]) {
        return; // Current attention has higher priority
      }
      
      // Clear current attention
      clearAttention();
    }
    
    const target: AttentionTarget = {
      id: generateAttentionId(),
      position,
      duration,
      priority,
      source,
      triggeredAt: now,
    };
    
    lastAttentionTimeRef.current = now;
    setUiAttention(target);
    onAttentionStart?.(target);
    
    // Auto-clear after duration
    attentionTimeoutRef.current = setTimeout(() => {
      clearAttention();
    }, duration);
  }, [config.attention, uiAttention, clearAttention, onAttentionStart]);
  
  /**
   * Handle overlay elements (modals, dialogs, sheets) - full attention.
   */
  const handleOverlayElement = useCallback((element: Element) => {
    if (!isActive) return;
    
    const position = getElementCenter(element);
    
    // Determine priority based on element type
    let priority: AttentionPriority = 'normal';
    if (element.matches('[role="alertdialog"]')) {
      priority = 'high'; // Alert dialogs are important
    }
    
    // Get source info for debugging
    const source = 'overlay:' + element.tagName.toLowerCase() + 
      (element.id ? `#${element.id}` : '');
    
    triggerAttention(position, { priority, source });
  }, [isActive, triggerAttention]);
  
  /**
   * Handle tab content changes - brief glance only.
   */
  const handleTabElement = useCallback((element: Element) => {
    if (!isActive) return;
    
    const position = getElementCenter(element);
    
    // Get source info for debugging
    const source = 'tab:' + element.tagName.toLowerCase() + 
      (element.id ? `#${element.id}` : '');
    
    // Use glance duration and mark as glance for shorter cooldown
    triggerAttention(position, { 
      priority: 'low', 
      source,
      duration: config.attention.glanceDuration,
      isGlance: true,
    });
  }, [isActive, triggerAttention, config.attention.glanceDuration]);
  
  /**
   * Handle tooltip elements - very brief, low priority.
   * Usually ignored due to low priority and cooldown.
   */
  const handleTooltipElement = useCallback((element: Element) => {
    if (!isActive) return;
    
    // Skip tooltips entirely - they're too noisy
    // Keeping this function for future use if needed
    void element;
  }, [isActive]);
  
  /**
   * Process an element to determine what kind of attention it should trigger.
   */
  const processElement = useCallback((element: Element) => {
    // Check overlay elements first (highest priority for attention)
    if (isOverlayElement(element)) {
      handleOverlayElement(element);
      return;
    }
    
    // Check tab elements (brief glance)
    if (isTabElement(element)) {
      handleTabElement(element);
      return;
    }
    
    // Tooltips are intentionally skipped (too noisy)
    if (isTooltipElement(element)) {
      handleTooltipElement(element);
      return;
    }
  }, [handleOverlayElement, handleTabElement, handleTooltipElement]);
  
  /**
   * Set up MutationObserver to watch for new UI elements.
   */
  useEffect(() => {
    if (!isActive) {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      return;
    }
    
    // Combined selectors for querying descendants
    const allSelectors = [...UI_OVERLAY_SELECTORS, ...TAB_SELECTORS].join(', ');
    
    // Create observer for new elements
    observerRef.current = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Check added nodes
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            // Check the node itself
            processElement(node);
            
            // Check descendants (for portaled content)
            const descendants = node.querySelectorAll(allSelectors);
            descendants.forEach(descendant => {
              processElement(descendant);
            });
          }
        }
        
        // Also check attribute changes (for state changes)
        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          const target = mutation.target;
          
          if (mutation.attributeName === 'data-state') {
            const newState = target.getAttribute('data-state');
            
            // For overlays: check if it became "open"
            if (newState === 'open' && isOverlayElement(target)) {
              handleOverlayElement(target);
            }
            
            // For tabs: check if it became "active"
            if (newState === 'active' && isTabElement(target)) {
              handleTabElement(target);
            }
          }
        }
      }
    });
    
    // Observe the entire document for changes
    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state'],
    });
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [isActive, processElement, handleOverlayElement, handleTabElement]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (attentionTimeoutRef.current) {
        clearTimeout(attentionTimeoutRef.current);
      }
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);
  
  /**
   * Compute the effective current attention.
   * Priority (highest to lowest):
   * 1. Typing attention (when actively typing in modal field)
   * 2. UI attention (modals, dialogs, overlays)
   * 
   * Typing attention is created dynamically from typingTarget.
   */
  const currentAttention = useMemo((): AttentionTarget | null => {
    // Typing attention takes priority over UI attention
    // This keeps Blobbi focused on the text field while typing
    if (isTypingInModal && typingTarget) {
      return {
        id: 'typing-attention',
        position: typingTarget,
        duration: 0, // Managed by typing timeout, not attention timeout
        priority: 'normal', // Below 'high' (alert dialogs) but above 'low'
        source: 'typing:modal-input',
        triggeredAt: Date.now(),
      };
    }
    
    // Fall back to UI attention
    return uiAttention;
  }, [isTypingInModal, typingTarget, uiAttention]);
  
  return {
    currentAttention,
    triggerAttention,
    clearAttention,
    isTypingInModal,
  };
}
