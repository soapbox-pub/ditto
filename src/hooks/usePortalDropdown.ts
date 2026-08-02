import { useEffect, useCallback, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/**
 * Fixed-position anchor for the dropdown. Below the caret the element is
 * anchored by its top edge (`top`); when flipped above the caret it is
 * anchored by its bottom edge (`bottom`, a CSS distance from the viewport
 * bottom) so a short result list still touches the caret line.
 */
export type DropdownPosition =
  | { top: number; left: number }
  | { bottom: number; left: number };

/** Turn a `DropdownPosition` into the inline style its `top`/`bottom` case needs. */
export function dropdownPositionStyle(pos: DropdownPosition): CSSProperties {
  return 'bottom' in pos ? { bottom: pos.bottom, left: pos.left } : { top: pos.top, left: pos.left };
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
      const caretTop = rect.top + caretCoords.top - textarea.scrollTop;
      const top = caretTop + lineHeight + 4;
      const left = rect.left + Math.max(0, Math.min(caretCoords.left, textarea.clientWidth - dropdownWidth));
      const clampedLeft = Math.max(8, Math.min(left, window.innerWidth - dropdownWidth - 8));

      // The iOS keyboard does not shrink `window.innerHeight`; the visual
      // viewport does. Prefer it so the flip math sees the keyboard as
      // covering the bottom of the screen.
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

      // Flip above when the estimated dropdown does not fit below the caret.
      // The flipped box anchors by its bottom edge at the caret line, so it
      // only needs room above the caret — not the full estimated height.
      // When the estimate fits neither direction, prefer the side with more
      // room so a short result list grows up instead of clipping at the
      // viewport bottom.
      const flippedTop = caretTop - dropdownHeight - 4;
      const belowFits = top + dropdownHeight <= viewportHeight;
      const aboveFits = flippedTop > 0;
      const useFlipped = !belowFits && (aboveFits || viewportHeight - top < caretTop - 4);

      if (useFlipped) {
        // Anchor by the bottom edge at the caret line instead of computing a
        // top offset from the assumed dropdownHeight: the rendered box is
        // capped at max-h, not fixed at that height, so a short result list
        // must still grow upward from the caret.
        const bottom = viewportHeight - (caretTop - 4);
        return { bottom, left: clampedLeft };
      }

      return { top, left: clampedLeft };
    },
    [textareaRef, dropdownHeight, dropdownWidth],
  );

  // Dismiss the dropdown when any ancestor scrolls or the window resizes,
  // since fixed positioning would cause the dropdown to become misaligned.
  // Scrolling *inside* the dropdown itself (e.g. paging through a long list)
  // must not dismiss it, so ignore scroll events that originate within it.
  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (target instanceof Element && target.closest('[data-autocomplete-dropdown]')) {
        return;
      }
      onClose();
    };
    const handleResize = () => onClose();
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, onClose]);

  return { computePosition, renderPortal: createPortal };
}
