/**
 * useTypingAttention Hook
 * 
 * Detects when the user is typing in a focused text field inside a modal/dialog,
 * and provides attention target information for Blobbi to look at the active field.
 * 
 * Behavior:
 * - Only activates when a text input is focused inside an overlay (modal/dialog)
 * - Tracks typing activity via keydown events
 * - Maintains attention lock while typing continues
 * - Releases attention after idle timeout (no typing for ~2s)
 * - Cleans up properly when focus changes or modal closes
 * 
 * Lightweight implementation:
 * - Uses focus/blur events (not polling)
 * - Uses keydown for typing detection (not expensive caret tracking)
 * - Targets field center (not exact caret position)
 * - Scoped to overlay elements only
 */

import { useState, useEffect, useCallback, useRef } from 'react';

import type { Position } from '../types/companion.types';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';

interface UseTypingAttentionOptions {
  /** Whether the typing attention system should be active */
  isActive: boolean;
}

interface UseTypingAttentionResult {
  /** Current typing attention target, or null if not typing in a modal field */
  typingTarget: Position | null;
  /** Whether user is actively typing (within idle timeout) */
  isTyping: boolean;
  /** The currently focused element, if any (for debugging) */
  focusedElement: Element | null;
}

// Selectors for text input elements
const TEXT_INPUT_SELECTORS = [
  'input[type="text"]',
  'input[type="email"]',
  'input[type="password"]',
  'input[type="search"]',
  'input[type="url"]',
  'input[type="tel"]',
  'input[type="number"]',
  'input:not([type])', // Input without type defaults to text
  'textarea',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[role="textbox"]',
];

// Selectors for overlay containers (modals/dialogs)
const OVERLAY_CONTAINER_SELECTORS = [
  '[data-radix-dialog-content]',
  '[data-radix-alert-dialog-content]',
  '[data-radix-popover-content]',
  '[data-vaul-drawer]',
  '[role="dialog"]',
  '[role="alertdialog"]',
];

/**
 * Check if an element is a text input.
 */
function isTextInput(element: Element): boolean {
  return TEXT_INPUT_SELECTORS.some(selector => element.matches(selector));
}

/**
 * Check if an element is inside an overlay container.
 */
function isInsideOverlay(element: Element): boolean {
  return OVERLAY_CONTAINER_SELECTORS.some(selector => element.closest(selector) !== null);
}

/**
 * Get the center position of an element.
 */
function getElementCenter(element: Element): Position {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/**
 * Hook to detect typing in modal/dialog text fields and provide attention target.
 */
export function useTypingAttention({
  isActive,
}: UseTypingAttentionOptions): UseTypingAttentionResult {
  const config = DEFAULT_COMPANION_CONFIG;
  
  const [typingTarget, setTypingTarget] = useState<Position | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [focusedElement, setFocusedElement] = useState<Element | null>(null);
  
  // Refs for tracking state and timeouts
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedElementRef = useRef<Element | null>(null);
  
  /**
   * Clear typing state and timeout.
   */
  const clearTypingState = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    setIsTyping(false);
    setTypingTarget(null);
  }, []);
  
  /**
   * Reset the typing idle timeout.
   * Called on each keydown to keep attention locked while typing continues.
   */
  const resetTypingTimeout = useCallback(() => {
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new timeout to release attention after idle period
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      setTypingTarget(null);
    }, config.attention.typingIdleTimeout);
  }, [config.attention.typingIdleTimeout]);
  
  /**
   * Handle focus on a text input inside an overlay.
   */
  const handleFocus = useCallback((event: FocusEvent) => {
    if (!isActive) return;
    
    const target = event.target;
    if (!(target instanceof Element)) return;
    
    // Check if this is a text input inside an overlay
    if (isTextInput(target) && isInsideOverlay(target)) {
      focusedElementRef.current = target;
      setFocusedElement(target);
      // Don't set typing target yet - wait for actual typing
    } else {
      // Focus moved to non-text or outside overlay
      focusedElementRef.current = null;
      setFocusedElement(null);
      clearTypingState();
    }
  }, [isActive, clearTypingState]);
  
  /**
   * Handle blur from a text input.
   */
  const handleBlur = useCallback((event: FocusEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    
    // Check if this was our tracked element
    if (target === focusedElementRef.current) {
      // Small delay to handle focus moving to another text input
      // (focusin fires before focusout in some cases)
      setTimeout(() => {
        // Check if focus moved to another valid target
        const activeElement = document.activeElement;
        if (activeElement && isTextInput(activeElement) && isInsideOverlay(activeElement)) {
          // Focus moved to another valid text input - update tracking
          focusedElementRef.current = activeElement;
          setFocusedElement(activeElement);
          // Update position if currently typing
          if (isTyping) {
            setTypingTarget(getElementCenter(activeElement));
          }
        } else {
          // Focus left text inputs - clear state
          focusedElementRef.current = null;
          setFocusedElement(null);
          clearTypingState();
        }
      }, 0);
    }
  }, [isTyping, clearTypingState]);
  
  /**
   * Handle keydown - detect typing activity.
   */
  const handleKeydown = useCallback((event: KeyboardEvent) => {
    if (!isActive) return;
    
    const target = event.target;
    if (!(target instanceof Element)) return;
    
    // Only track typing keys (ignore modifiers, navigation keys)
    const isTypingKey = event.key.length === 1 || 
      event.key === 'Backspace' || 
      event.key === 'Delete' ||
      event.key === 'Enter';
    
    if (!isTypingKey) return;
    
    // Check if this is in our tracked text input
    if (target === focusedElementRef.current || 
        (isTextInput(target) && isInsideOverlay(target))) {
      
      // Update focused element if needed
      if (target !== focusedElementRef.current) {
        focusedElementRef.current = target;
        setFocusedElement(target);
      }
      
      // Set typing state and target
      setIsTyping(true);
      setTypingTarget(getElementCenter(target));
      
      // Reset the idle timeout
      resetTypingTimeout();
    }
  }, [isActive, resetTypingTimeout]);
  
  /**
   * Set up event listeners.
   */
  useEffect(() => {
    if (!isActive) {
      clearTypingState();
      focusedElementRef.current = null;
      setFocusedElement(null);
      return;
    }
    
    // Use capture phase to catch events early
    document.addEventListener('focusin', handleFocus, true);
    document.addEventListener('focusout', handleBlur, true);
    document.addEventListener('keydown', handleKeydown, true);
    
    // Check if there's already a focused text input in an overlay
    const activeElement = document.activeElement;
    if (activeElement && isTextInput(activeElement) && isInsideOverlay(activeElement)) {
      focusedElementRef.current = activeElement;
      setFocusedElement(activeElement);
    }
    
    return () => {
      document.removeEventListener('focusin', handleFocus, true);
      document.removeEventListener('focusout', handleBlur, true);
      document.removeEventListener('keydown', handleKeydown, true);
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [isActive, handleFocus, handleBlur, handleKeydown, clearTypingState]);
  
  return {
    typingTarget,
    isTyping,
    focusedElement,
  };
}
