import type { NostrEvent } from '@nostrify/nostrify';
import type { MuteListItem } from '@/hooks/useMuteList';

/**
 * Check if an event should be muted based on mute list items
 */
export function isEventMuted(event: NostrEvent, muteItems: MuteListItem[]): boolean {
  // Check if author is muted
  const mutedPubkeys = muteItems
    .filter((item) => item.type === 'pubkey')
    .map((item) => item.value);
  
  if (mutedPubkeys.includes(event.pubkey)) {
    return true;
  }

  // Check if thread is muted (event is a reply to a muted thread)
  const mutedThreads = muteItems
    .filter((item) => item.type === 'thread')
    .map((item) => item.value);

  const replyToEventId = event.tags.find(([name]) => name === 'e')?.[1];
  if (replyToEventId && mutedThreads.includes(replyToEventId)) {
    return true;
  }

  // Check if event itself is muted as a thread
  if (mutedThreads.includes(event.id)) {
    return true;
  }

  // Check if any hashtags are muted
  const mutedHashtags = muteItems
    .filter((item) => item.type === 'hashtag')
    .map((item) => item.value.toLowerCase());

  const eventHashtags = event.tags
    .filter(([name]) => name === 't')
    .map(([, value]) => value?.toLowerCase())
    .filter((value): value is string => !!value);

  if (eventHashtags.some((tag) => mutedHashtags.includes(tag))) {
    return true;
  }

  // Check if any muted words appear in content
  const mutedWords = muteItems
    .filter((item) => item.type === 'word')
    .map((item) => item.value.toLowerCase());

  const contentLower = event.content.toLowerCase();
  if (mutedWords.some((word) => contentLower.includes(word))) {
    return true;
  }

  return false;
}

/**
 * Filter an array of events to exclude muted content
 */
export function filterMutedEvents(events: NostrEvent[], muteItems: MuteListItem[]): NostrEvent[] {
  if (muteItems.length === 0) {
    return events;
  }

  return events.filter((event) => !isEventMuted(event, muteItems));
}

/**
 * Get a summary of what's being muted
 */
export function getMuteSummary(muteItems: MuteListItem[]): {
  pubkeys: number;
  hashtags: number;
  words: number;
  threads: number;
  total: number;
  hasPrivate: boolean;
} {
  return {
    pubkeys: muteItems.filter((item) => item.type === 'pubkey').length,
    hashtags: muteItems.filter((item) => item.type === 'hashtag').length,
    words: muteItems.filter((item) => item.type === 'word').length,
    threads: muteItems.filter((item) => item.type === 'thread').length,
    total: muteItems.length,
  };
}


