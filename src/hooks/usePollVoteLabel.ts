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
  const parentTag = useMemo(
    () => event.kind === 1018 ? event.tags.find(([n]) => n === 'e') : undefined,
    [event],
  );
  const parentId = parentTag?.[1];
  const relayHint = parentTag?.[2] || undefined;
  const authorHint = parentTag?.[4] || (event.kind === 1018 ? event.tags.find(([n]) => n === 'p')?.[1] : undefined) || undefined;

  const { data: parentPoll } = useEvent(parentId, relayHint ? [relayHint] : undefined, authorHint);

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
