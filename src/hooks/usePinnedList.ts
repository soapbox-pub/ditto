import { useCallback, useState } from 'react';
import { useIntl } from 'react-intl';
import { useSavedFeeds } from './useSavedFeeds';
import { useToast } from './useToast';

/**
 * Pin a people list (kind 30000 follow set or kind 39089 follow pack) to the
 * home feed as a tab.
 *
 * Stored as a saved feed whose authors come from the list's `p` tags at read
 * time, so the tab keeps up as members are added or removed.
 */
export function usePinnedList(kind: number, pubkey: string, dTag: string, title: string) {
  const intl = useIntl();
  const { toast } = useToast();
  const { savedFeeds, addSavedFeed, removeSavedFeed } = useSavedFeeds();
  const [isPending, setIsPending] = useState(false);

  const pointer = `a:${kind}:${pubkey}:${dTag}`;
  const pinnedFeed = savedFeeds.find((f) => f.vars.some((v) => v.pointer === pointer));

  const togglePin = useCallback(async () => {
    if (isPending) return;
    setIsPending(true);
    try {
      if (pinnedFeed) {
        await removeSavedFeed(pinnedFeed.id);
        toast({ title: intl.formatMessage({ id: 'peopleList.unpinned', defaultMessage: 'Removed from your home feed' }) });
      } else {
        await addSavedFeed(
          title,
          { kinds: [1, 6, 16], authors: ['$list'] },
          [{ name: '$list', tagName: 'p', pointer }],
        );
        toast({ title: intl.formatMessage({ id: 'peopleList.pinned', defaultMessage: 'Pinned to your home feed' }) });
      }
    } catch {
      toast({ title: intl.formatMessage({ id: 'peopleList.pinFailed', defaultMessage: 'Failed to update your home feed' }), variant: 'destructive' });
    } finally {
      setIsPending(false);
    }
  }, [isPending, pinnedFeed, removeSavedFeed, addSavedFeed, title, pointer, toast, intl]);

  return { isPinned: !!pinnedFeed, isPending, togglePin };
}
