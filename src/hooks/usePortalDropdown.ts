import { useEffect, useCallback, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface DropdownPosition {
  top: number;
  left: number;
}

interface UsePortalDropdownOptions {
  /** Ref to the textarea the dropdown is anchored to. */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Whether the dropdown is currently visible. */
  isOpen: boolean;
  /** Callback to close the dropdown (e.g. on scroll/resize). */
  onClose: () => void;
  /** Max height of the dropdown in px (must match the CSS max-h value). */
  dropdownHeight: number;
  /** Width of the dropdown in px (must match the CSS width value). */
  dropdownWidth?: number;
}

/**
 * Computes fixed viewport coordinates for an autocomplete dropdown anchored
 * to a caret position inside a textarea. The dropdown is positioned below
 * the caret line, or flipped above if it would overflow the viewport bottom.
 *
 * Also dismisses the dropdown on scroll or resize, since fixed positioning
 * would cause misalignment.
 *
 * Use `renderPortal` to render the dropdown as a portal to `document.body`
 * so it escapes ancestor overflow clipping and CSS transform containing
 * blocks (e.g. Radix Dialog).
 */
export function usePortalDropdown({
  textareaRef,
  isOpen,
  onClose,
  dropdownHeight,
  dropdownWidth = 280,
}: UsePortalDropdownOptions) {

  /** Compute fixed viewport position for the dropdown given a caret index. */
  const computePosition = useCallback(
    (caretCoords: { top: number; left: number }): DropdownPosition => {
      const textarea = textareaRef.current;
      if (!textarea) return { top: 0, left: 0 };

      const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 20;
      const rect = textarea.getBoundingClientRect();
      const top = rect.top + caretCoords.top - textarea.scrollTop + lineHeight + 4;
      const left = rect.left + Math.max(0, Math.min(caretCoords.left, textarea.clientWidth - dropdownWidth));

      // If the dropdown would overflow the bottom of the viewport, flip above
      const flippedTop = rect.top + caretCoords.top - textarea.scrollTop - dropdownHeight - 4;
      const useFlipped = top + dropdownHeight > window.innerHeight && flippedTop > 0;

      return {
        top: useFlipped ? flippedTop : top,
        left: Math.max(8, Math.min(left, window.innerWidth - dropdownWidth - 8)),
      };
    },
    [textareaRef, dropdownHeight, dropdownWidth],
  );

  // Dismiss the dropdown when any ancestor scrolls or the window resizes,
  // since fixed positioning would cause the dropdown to become misaligned.
  useEffect(() => {
    if (!isOpen) return;
    const handleDismiss = () => onClose();
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    return () => {
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [isOpen, onClose]);

  return { computePosition, renderPortal: createPortal };
}
