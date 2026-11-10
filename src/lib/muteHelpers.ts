import type { NostrEvent } from '@nostrify/nostrify';
import type { MuteListItem } from '@/hooks/useMuteList';

export interface MuteCheckOptions {
  /**
   * Skip content-based mute checks (muted hashtags and muted words).
   * Explicit pubkey and thread mutes always apply.
   * Used to exempt followed accounts when `exemptFollowsFromFilters` is on.
   */
  skipContentMutes?: boolean;
}

/**
 * Check if an event should be muted based on mute list items
 */
export function isEventMuted(
  event: NostrEvent,
  muteItems: MuteListItem[],
  options?: MuteCheckOptions,
): boolean {
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

  // A NIP-10 reply names the thread in its `e` tags; a NIP-22 comment names
  // the parent in `e` and the thread root in `E`, so both have to be checked
  // or muting a thread would miss every reply below the first level.
  // NIP-10 `mention` e-tags are inline quotes, not thread references.
  const threadRefs = event.tags
    .filter(([name, , , marker]) => (name === 'e' && marker !== 'mention') || name === 'E')
    .map(([, value]) => value);

  if (threadRefs.some((id) => id && mutedThreads.includes(id))) {
    return true;
  }

  // Check if event itself is muted as a thread
  if (mutedThreads.includes(event.id)) {
    return true;
  }

  // Content-based mutes (hashtags, words) can be skipped, e.g. for follows.
  if (options?.skipContentMutes) {
    return false;
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

  if (mutedWords.length === 0) {
    return false;
  }

  const text = mutableText(event);
  if (mutedWords.some((word) => text.includes(word))) {
    return true;
  }

  return false;
}

/** Profile fields shown to people, matched instead of the raw kind 0 JSON. */
const PROFILE_TEXT_FIELDS = ['name', 'display_name', 'about', 'nip05', 'website'];

/** Tags whose value is text a client shows in place of, or beside, the content. */
const TEXT_TAGS = new Set(['title', 'summary', 'name', 'description', 'subject', 'location', 'content-warning']);

/**
 * The lowercased text muted words are matched against: the content plus the
 * visible text some kinds keep in tags (titles, summaries, poll options, image
 * alt text). A profile matches on its name, bio, and other visible fields, not
 * the JSON keys. A reaction's `+` or empty content is a 👍 like, so a muted 👍
 * hides those too.
 */
function mutableText(event: NostrEvent): string {
  if (event.kind === 7) {
    const content = event.content.trim();
    if (content === '+' || content === '') return '👍';
  }

  if (event.kind === 0) {
    try {
      const metadata: unknown = JSON.parse(event.content);
      if (metadata && typeof metadata === 'object') {
        const record = metadata as Record<string, unknown>;
        return PROFILE_TEXT_FIELDS
          .map((field) => record[field])
          .filter((value): value is string => typeof value === 'string')
          .join('\n')
          .toLowerCase();
      }
    } catch {
      // Not JSON; fall back to the raw content.
    }
    return event.content.toLowerCase();
  }

  const parts = [event.content];
  for (const [name, ...values] of event.tags) {
    // A zap receipt's `description` is the zap request JSON, not prose.
    if (TEXT_TAGS.has(name) && !(name === 'description' && event.kind === 9735)) {
      if (values[0]) parts.push(values[0]);
    } else if (name === 'option') {
      if (values[1]) parts.push(values[1]);
    } else if (name === 'imeta') {
      for (const entry of values) {
        if (entry?.startsWith('alt ')) parts.push(entry.slice(4));
      }
    }
  }
  return parts.join('\n').toLowerCase();
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
} {
  return {
    pubkeys: muteItems.filter((item) => item.type === 'pubkey').length,
    hashtags: muteItems.filter((item) => item.type === 'hashtag').length,
    words: muteItems.filter((item) => item.type === 'word').length,
    threads: muteItems.filter((item) => item.type === 'thread').length,
    total: muteItems.length,
  };
}


