import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Whether a click carries the browser's "open in new tab" modifier
 * (Cmd on macOS, Ctrl elsewhere). Always false on native, where the
 * WebView has no tabs and `window.open` is unreliable.
 */
export function isNewTabClick(e: Pick<React.MouseEvent, 'metaKey' | 'ctrlKey'>): boolean {
  return !Capacitor.isNativePlatform() && (e.metaKey || e.ctrlKey);
}

/**
 * Returns onClick and onAuxClick handlers for navigating to a post URL.
 * - Left click: navigate in the same tab
 * - Cmd/Ctrl + click or middle click: open in a new tab (web only)
 *
 * When the clicked post's event object is passed, it is seeded into the
 * `['event', id]` query cache before navigating so the detail page resolves
 * from memory instead of refetching an event we literally have on hand.
 * (Feeds already seed the events they render; this covers cards rendered
 * from sources that don't, e.g. thread replies and sidebar widgets.)
 */
export function useOpenPost(path: string, event?: NostrEvent) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const onClick = (e?: Pick<React.MouseEvent, 'metaKey' | 'ctrlKey'>) => {
    if (e && isNewTabClick(e)) {
      window.open(path, '_blank');
      return;
    }
    if (event && !queryClient.getQueryData(['event', event.id])) {
      queryClient.setQueryData(['event', event.id], event);
    }
    navigate(path);
  };

  const onAuxClick = (e: React.MouseEvent) => {
    if (e.button !== 1 || Capacitor.isNativePlatform()) return;
    e.preventDefault();
    window.open(path, '_blank');
  };

  return { onClick, onAuxClick };
}
