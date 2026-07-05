import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Returns onClick and onAuxClick handlers for navigating to a post URL.
 * - Left click: navigate in the same tab
 * - Middle click: open in a new tab
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

  const onClick = () => {
    if (event && !queryClient.getQueryData(['event', event.id])) {
      queryClient.setQueryData(['event', event.id], event);
    }
    navigate(path);
  };

  const onAuxClick = (e: React.MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    window.open(path, '_blank');
  };

  return { onClick, onAuxClick };
}
