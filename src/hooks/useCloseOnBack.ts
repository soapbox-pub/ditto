import { useEffect, useRef } from 'react';

/** Close handlers of the open overlays, last opened last. */
const openOverlays: Array<{ close: () => void }> = [];

/**
 * Let the Android back gesture close a hand-built overlay while it's open,
 * instead of leaving the page under it (see BackButtonHandler). Radix
 * dialogs and sheets need nothing: back already closes those.
 *
 * Unlike {@link useBackDismiss}, this adds no history entry, so an overlay
 * that navigates as it closes (picking a search result) leaves none behind.
 */
export function useCloseOnBack(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const entry = { close: () => onCloseRef.current() };
    openOverlays.push(entry);
    return () => {
      const i = openOverlays.indexOf(entry);
      if (i !== -1) openOverlays.splice(i, 1);
    };
  }, [open]);
}

/** Close the overlay opened last, if any. Returns whether there was one. */
export function closeTopOverlay(): boolean {
  const top = openOverlays[openOverlays.length - 1];
  if (!top) return false;
  top.close();
  return true;
}
