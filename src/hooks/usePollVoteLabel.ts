import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useEvent } from '@/hooks/useEvent';

/**
 * Given a kind 1018 poll vote event, resolves the human-readable option label(s)
 * by fetching the parent poll and mapping response IDs to option names.
 *
 * Returns an empty string for non-1018 events or if the parent poll hasn't loaded yet.
 */
export function usePollVoteLabel(event: NostrEvent): string {
  const parentId = useMemo(
    () => event.kind === 1018 ? event.tags.find(([n]) => n === 'e')?.[1] : undefined,
    [event],
  );

  const { data: parentPoll } = useEvent(parentId);

  return useMemo(() => {
    const responseIds = event.kind === 1018
      ? event.tags.filter(([n]) => n === 'response').map(([, id]) => id)
      : [];
    if (responseIds.length === 0) return '';
    if (!parentPoll) return responseIds.join(', ');
    const optMap = new Map<string, string>();
    for (const tag of parentPoll.tags) {
      if (tag[0] === 'option') optMap.set(tag[1], tag[2]);
    }
    return responseIds.map((id) => optMap.get(id) ?? id).join(', ');
  }, [event, parentPoll]);
}
