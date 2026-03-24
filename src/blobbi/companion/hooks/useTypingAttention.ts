/**
 * useTypingAttention Hook
 * 
 * Detects when the user is typing in a focused text field inside a modal/dialog,
 * and provides a caret-aware attention target for Blobbi to observe the typing location.
 * 
 * Caret tracking priority:
 * 1. Best effort: Real caret position via native APIs
 *    - input/textarea: selectionStart + text measurement
 *    - contenteditable: window.getSelection() + Range.getBoundingClientRect()
 * 2. Fallback: Right-side typing region of the field
 * 3. Last resort: Field center
 * 
 * Behavior:
 * - Only activates when a text input is focused inside an overlay (modal/dialog)
 * - Tracks typing activity via keydown/input events
 * - Updates caret position on each typing event
 * - Maintains attention lock while typing continues
 * - Releases attention after 4s idle timeout
 * - Cleans up properly when focus changes or modal closes
 * 
 * Event-driven implementation:
 * - Recomputes caret target on keydown, input, selectionchange
 * - No continuous polling
 * - Clean teardown on unmount or focus change
 */

import { useState, useEffect, useCallback, useRef } from 'react';

import type { Position } from '../types/companion.types';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';

interface UseTypingAttentionOptions {
  /** Whether the typing attention system should be active */
  isActive: boolean;
}

interface UseTypingAttentionResult {
  /** Current typing attention target (caret position or fallback) */
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
 * Check if element is an input or textarea (has selectionStart).
 */
function isInputOrTextarea(element: Element): element is HTMLInputElement | HTMLTextAreaElement {
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';
}

/**
 * Check if element is contenteditable.
 */
function isContentEditable(element: Element): element is HTMLElement {
  return element.hasAttribute('contenteditable') && 
    element.getAttribute('contenteditable') !== 'false';
}

/**
 * Get the caret position for contenteditable elements using Selection API.
 * Returns null if unable to compute.
 */
function getContentEditableCaretPosition(element: HTMLElement): Position | null {
  try {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    
    const range = selection.getRangeAt(0);
    
    // Check if selection is within our element
    if (!element.contains(range.commonAncestorContainer)) return null;
    
    // Get the bounding rect of the collapsed range (caret position)
    const rects = range.getClientRects();
    if (rects.length > 0) {
      // Use the last rect (caret is at the end of selection)
      const rect = rects[rects.length - 1];
      return {
        x: rect.right, // Right edge is where caret sits
        y: rect.top + rect.height / 2,
      };
    }
    
    // Fallback: use range bounding rect
    const boundingRect = range.getBoundingClientRect();
    if (boundingRect.width === 0 && boundingRect.height === 0) {
      // Empty range at start of empty element - use element position
      return null;
    }
    
    return {
      x: boundingRect.right,
      y: boundingRect.top + boundingRect.height / 2,
    };
  } catch {
    return null;
  }
}

/**
 * Create a mirror element for measuring text width in input/textarea.
 * This is a lightweight approach that creates/destroys on demand.
 */
function measureTextWidth(
  element: HTMLInputElement | HTMLTextAreaElement,
  text: string
): number {
  // Create a temporary span for measurement
  const mirror = document.createElement('span');
  
  // Copy relevant styles
  const styles = window.getComputedStyle(element);
  mirror.style.cssText = `
    position: absolute;
    visibility: hidden;
    white-space: pre;
    font-family: ${styles.fontFamily};
    font-size: ${styles.fontSize};
    font-weight: ${styles.fontWeight};
    font-style: ${styles.fontStyle};
    letter-spacing: ${styles.letterSpacing};
    text-transform: ${styles.textTransform};
  `;
  
  mirror.textContent = text;
  document.body.appendChild(mirror);
  const width = mirror.offsetWidth;
  document.body.removeChild(mirror);
  
  return width;
}

/**
 * Get the caret position for input/textarea elements using selectionStart.
 * Returns null if unable to compute.
 */
function getInputCaretPosition(element: HTMLInputElement | HTMLTextAreaElement): Position | null {
  try {
    const selectionStart = element.selectionStart;
    if (selectionStart === null) return null;
    
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    
    // Get padding
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingTop = parseFloat(styles.paddingTop) || 0;
    
    // For single-line inputs
    if (element.tagName === 'INPUT') {
      const textBeforeCaret = element.value.substring(0, selectionStart);
      const textWidth = measureTextWidth(element, textBeforeCaret);
      
      // Account for scroll position in the input
      const scrollLeft = element.scrollLeft || 0;
      
      // Calculate X position (clamped to input bounds)
      const caretX = Math.min(
        rect.left + paddingLeft + textWidth - scrollLeft,
        rect.right - parseFloat(styles.paddingRight || '0')
      );
      
      // Y is vertically centered for single-line inputs
      const caretY = rect.top + rect.height / 2;
      
      return { x: caretX, y: caretY };
    }
    
    // For textarea - need to handle multiple lines
    if (element.tagName === 'TEXTAREA') {
      const textarea = element as HTMLTextAreaElement;
      const value = textarea.value;
      const textBeforeCaret = value.substring(0, selectionStart);
      
      // Count lines before caret
      const lines = textBeforeCaret.split('\n');
      const currentLineIndex = lines.length - 1;
      const currentLineText = lines[currentLineIndex];
      
      // Measure current line text width
      const textWidth = measureTextWidth(element, currentLineText);
      
      // Get line height
      const lineHeight = parseFloat(styles.lineHeight) || parseFloat(styles.fontSize) * 1.2;
      
      // Account for scroll
      const scrollLeft = textarea.scrollLeft || 0;
      const scrollTop = textarea.scrollTop || 0;
      
      // Calculate position
      const caretX = Math.min(
        rect.left + paddingLeft + textWidth - scrollLeft,
        rect.right - parseFloat(styles.paddingRight || '0')
      );
      
      const caretY = rect.top + paddingTop + (currentLineIndex * lineHeight) + (lineHeight / 2) - scrollTop;
      
      // Clamp Y to textarea bounds
      const clampedY = Math.max(rect.top, Math.min(caretY, rect.bottom));
      
      return { x: caretX, y: clampedY };
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the right-side typing region of a field (fallback position).
 * This represents "where new text would appear" - better than center.
 */
function getRightTypingRegion(element: Element): Position {
  const rect = element.getBoundingClientRect();
  const styles = window.getComputedStyle(element);
  const paddingRight = parseFloat(styles.paddingRight) || 8;
  
  return {
    // Right side minus padding - where typing "ends up"
    x: rect.right - paddingRight - 10,
    // Vertically centered
    y: rect.top + rect.height / 2,
  };
}

/**
 * Get the center position of an element (last resort fallback).
 */
function getElementCenter(element: Element): Position {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/**
 * Compute the best available caret/typing position for an element.
 * Uses priority: exact caret > right typing region > center
 */
function computeCaretPosition(element: Element): Position {
  // Try contenteditable first
  if (isContentEditable(element)) {
    const caretPos = getContentEditableCaretPosition(element);
    if (caretPos) return caretPos;
  }
  
  // Try input/textarea
  if (isInputOrTextarea(element)) {
    const caretPos = getInputCaretPosition(element);
    if (caretPos) return caretPos;
  }
  
  // Fallback 1: Right typing region (better than center for text entry)
  // This makes Blobbi look at "where the typing is happening"
  const rightRegion = getRightTypingRegion(element);
  const rect = element.getBoundingClientRect();
  
  // Only use right region if the element has reasonable width
  if (rect.width > 50) {
    return rightRegion;
  }
  
  // Fallback 2: Element center
  return getElementCenter(element);
}

/**
 * Hook to detect typing in modal/dialog text fields and provide caret-aware attention target.
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
   * Update the typing target position based on current caret location.
   */
  const updateCaretPosition = useCallback(() => {
    const element = focusedElementRef.current;
    if (!element) return;
    
    const position = computeCaretPosition(element);
    setTypingTarget(position);
  }, []);
  
  /**
   * Reset the typing idle timeout.
   * Called on each typing event to keep attention locked while typing continues.
   */
  const resetTypingTimeout = useCallback(() => {
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new timeout to release attention after idle period (4 seconds)
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
      setTimeout(() => {
        // Check if focus moved to another valid target
        const activeElement = document.activeElement;
        if (activeElement && isTextInput(activeElement) && isInsideOverlay(activeElement)) {
          // Focus moved to another valid text input - update tracking
          focusedElementRef.current = activeElement;
          setFocusedElement(activeElement);
          // Update position if currently typing
          if (isTyping) {
            updateCaretPosition();
          }
        } else {
          // Focus left text inputs - clear state
          focusedElementRef.current = null;
          setFocusedElement(null);
          clearTypingState();
        }
      }, 0);
    }
  }, [isTyping, clearTypingState, updateCaretPosition]);
  
  /**
   * Handle keydown - detect typing activity and update caret position.
   */
  const handleKeydown = useCallback((event: KeyboardEvent) => {
    if (!isActive) return;
    
    const target = event.target;
    if (!(target instanceof Element)) return;
    
    // Only track typing keys (ignore pure modifiers, navigation without text change)
    const isTypingKey = event.key.length === 1 || 
      event.key === 'Backspace' || 
      event.key === 'Delete' ||
      event.key === 'Enter';
    
    if (!isTypingKey) return;
    
    // Check if this is in our tracked text input or a valid new one
    if (target === focusedElementRef.current || 
        (isTextInput(target) && isInsideOverlay(target))) {
      
      // Update focused element if needed
      if (target !== focusedElementRef.current) {
        focusedElementRef.current = target;
        setFocusedElement(target);
      }
      
      // Set typing state
      setIsTyping(true);
      
      // Update caret position (will be computed after the keystroke processes)
      // Use requestAnimationFrame to let the DOM update first
      requestAnimationFrame(() => {
        updateCaretPosition();
      });
      
      // Reset the idle timeout
      resetTypingTimeout();
    }
  }, [isActive, resetTypingTimeout, updateCaretPosition]);
  
  /**
   * Handle input event - update caret position after text changes.
   * This catches paste, autocomplete, and other non-keydown text changes.
   */
  const handleInput = useCallback((event: Event) => {
    if (!isActive) return;
    
    const target = event.target;
    if (!(target instanceof Element)) return;
    
    // Check if this is our tracked element
    if (target === focusedElementRef.current) {
      // Update typing state and caret position
      setIsTyping(true);
      updateCaretPosition();
      resetTypingTimeout();
    }
  }, [isActive, updateCaretPosition, resetTypingTimeout]);
  
  /**
   * Handle selection change - update caret position when selection moves.
   * This catches arrow key navigation, mouse clicks within field, etc.
   */
  const handleSelectionChange = useCallback(() => {
    if (!isActive) return;
    
    // Only update if we're currently tracking a field and typing
    if (focusedElementRef.current && isTyping) {
      // Check if selection is still in our element
      const activeElement = document.activeElement;
      if (activeElement === focusedElementRef.current) {
        updateCaretPosition();
      }
    }
  }, [isActive, isTyping, updateCaretPosition]);
  
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
    document.addEventListener('input', handleInput, true);
    document.addEventListener('selectionchange', handleSelectionChange);
    
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
      document.removeEventListener('input', handleInput, true);
      document.removeEventListener('selectionchange', handleSelectionChange);
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [isActive, handleFocus, handleBlur, handleKeydown, handleInput, handleSelectionChange, clearTypingState]);
  
  return {
    typingTarget,
    isTyping,
    focusedElement,
  };
}
