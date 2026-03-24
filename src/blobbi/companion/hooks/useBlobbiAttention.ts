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

import { useState, useEffect, useCallback, useRef } from 'react';

import type { AttentionTarget, AttentionPriority, Position } from '../types/companion.types';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';

interface UseBlobbiAttentionOptions {
  /** Whether attention system should be active */
  isActive: boolean;
  /** Callback when a new attention target is triggered */
  onAttentionStart?: (target: AttentionTarget) => void;
  /** Callback when attention ends */
  onAttentionEnd?: (targetId: string) => void;
}

interface UseBlobbiAttentionResult {
  /** Current attention target, if any */
  currentAttention: AttentionTarget | null;
  /** Manually trigger attention to a position */
  triggerAttention: (position: Position, options?: TriggerOptions) => void;
  /** Clear current attention */
  clearAttention: () => void;
}

interface TriggerOptions {
  duration?: number;
  priority?: AttentionPriority;
  source?: string;
}

// Selectors for UI elements that should trigger attention
const UI_ELEMENT_SELECTORS = [
  // Radix UI primitives (used by shadcn/ui)
  '[data-radix-dialog-content]',
  '[data-radix-alert-dialog-content]',
  '[data-radix-popover-content]',
  '[data-radix-dropdown-menu-content]',
  '[data-radix-context-menu-content]',
  '[data-radix-hover-card-content]',
  '[data-radix-tooltip-content]',
  '[data-radix-navigation-menu-content]',
  // Vaul drawer
  '[data-vaul-drawer]',
  // Common modal/dialog patterns
  '[role="dialog"]',
  '[role="alertdialog"]',
  // Sheet/drawer patterns
  '[data-state="open"][data-side]',
];

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
 * Check if an element is a UI overlay we should attend to.
 */
function isAttentionableElement(element: Element): boolean {
  return UI_ELEMENT_SELECTORS.some(selector => element.matches(selector));
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
  const [currentAttention, setCurrentAttention] = useState<AttentionTarget | null>(null);
  
  const config = DEFAULT_COMPANION_CONFIG;
  const lastAttentionTimeRef = useRef<number>(0);
  const attentionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  
  /**
   * Clear current attention and any pending timeouts.
   */
  const clearAttention = useCallback(() => {
    if (attentionTimeoutRef.current) {
      clearTimeout(attentionTimeoutRef.current);
      attentionTimeoutRef.current = null;
    }
    
    setCurrentAttention(prev => {
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
    
    // Respect cooldown to avoid spamming
    if (timeSinceLastAttention < config.attention.cooldown) {
      return;
    }
    
    const {
      duration = config.attention.defaultDuration,
      priority = 'normal',
      source,
    } = options;
    
    // If there's a current attention, check priority
    if (currentAttention) {
      const priorityOrder: Record<AttentionPriority, number> = {
        low: 0,
        normal: 1,
        high: 2,
      };
      
      if (priorityOrder[priority] < priorityOrder[currentAttention.priority]) {
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
    setCurrentAttention(target);
    onAttentionStart?.(target);
    
    // Auto-clear after duration
    attentionTimeoutRef.current = setTimeout(() => {
      clearAttention();
    }, duration);
  }, [config.attention, currentAttention, clearAttention, onAttentionStart]);
  
  /**
   * Handle new elements appearing in the DOM.
   */
  const handleNewElement = useCallback((element: Element) => {
    if (!isActive) return;
    if (!isAttentionableElement(element)) return;
    
    const position = getElementCenter(element);
    
    // Determine priority based on element type
    let priority: AttentionPriority = 'normal';
    if (element.matches('[role="alertdialog"]')) {
      priority = 'high'; // Alert dialogs are important
    } else if (element.matches('[data-radix-tooltip-content]')) {
      priority = 'low'; // Tooltips are less important
    }
    
    // Get source info for debugging
    const source = element.tagName.toLowerCase() + 
      (element.id ? `#${element.id}` : '') +
      (element.className ? `.${element.className.split(' ')[0]}` : '');
    
    triggerAttention(position, { priority, source });
  }, [isActive, triggerAttention]);
  
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
    
    // Create observer for new elements
    observerRef.current = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Check added nodes
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            // Check the node itself
            if (isAttentionableElement(node)) {
              handleNewElement(node);
            }
            
            // Check descendants (for portaled content)
            const descendants = node.querySelectorAll(UI_ELEMENT_SELECTORS.join(', '));
            descendants.forEach(descendant => {
              handleNewElement(descendant);
            });
          }
        }
        
        // Also check attribute changes (for state="open" transitions)
        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          const target = mutation.target;
          
          // Check if it became open/visible
          if (mutation.attributeName === 'data-state') {
            const newState = target.getAttribute('data-state');
            if (newState === 'open' && isAttentionableElement(target)) {
              handleNewElement(target);
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
  }, [isActive, handleNewElement]);
  
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
  
  return {
    currentAttention,
    triggerAttention,
    clearAttention,
  };
}
