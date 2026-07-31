import { useEffect, useRef } from 'react';

/**
 * Integrates a transient overlay (lightbox, fullscreen viewer, modal) with the
 * browser history stack so the platform "back" gesture dismisses the overlay
 * instead of navigating the underlying page away.
 *
 * On mount it pushes a throwaway history entry. When the user triggers back
 * (iOS edge-swipe / Android gesture or hardware button / desktop back button),
 * `popstate` fires and we call `onClose` rather than letting the page unwind.
 * When the overlay is dismissed by any other means (Escape, close button,
 * swipe-to-dismiss, backdrop tap), the cleanup pops the entry we added so the
 * history stack is left exactly as we found it.
 *
 * @param onClose Called when the overlay should close. Kept in a ref internally,
 *   so it need not be memoized by the caller.
 */
export function useBackDismiss(onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // True once a `popstate` (back gesture) has already consumed our entry, so
    // the unmount cleanup knows not to pop a second time.
    let poppedByBack = false;

    window.history.pushState({ dittoBackDismiss: true }, '');

    const onPopState = () => {
      poppedByBack = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      // Closed by something other than a back gesture — remove the entry we
      // pushed so a later real back press doesn't just no-op on our dummy state.
      if (!poppedByBack) {
        window.history.back();
      }
    };
  }, []);
}
