import type { NostrEvent } from '@nostrify/nostrify';

import { getZapSenderPubkey } from '@/lib/zapSender';

export interface MuteListItem {
  type: 'pubkey' | 'hashtag' | 'word' | 'thread';
  value: string;
}

export interface MuteCheckOptions {
  /**
   * Skip content-based mute checks (muted hashtags and muted words).
   * Explicit pubkey and thread mutes always apply.
   * Used to exempt followed accounts when `exemptFollowsFromFilters` is on.
   */
  skipContentMutes?: boolean;
}

/** A mute list compiled once, for checking many events against it. */
export interface MuteMatcher {
  /** Whether the list mutes `event`. */
  isMuted: (event: NostrEvent, options?: MuteCheckOptions) => boolean;
  /** Whether a muted word appears in `event`'s visible text. */
  hasMutedWord: (event: NostrEvent) => boolean;
  /**
   * Whether `event` is a muted thread or a reply inside one. Checked against
   * the post a reaction, repost, or zap targets, so acting on any reply in a
   * muted thread is hidden too, not only acting on its root.
   */
  inMutedThread: (event: NostrEvent) => boolean;
  /** The muted words, lowercased and sorted, joined into a stable key. */
  wordsKey: string;
}

/**
 * Compile `muteItems` into sets and a word list once, so checking an event
 * doesn't walk the whole list each time.
 */
export function createMuteMatcher(muteItems: MuteListItem[]): MuteMatcher {
  const pubkeys = new Set<string>();
  const threads = new Set<string>();
  const hashtags = new Set<string>();
  const words: string[] = [];

  for (const item of muteItems) {
    switch (item.type) {
      case 'pubkey': pubkeys.add(item.value); break;
      case 'thread': threads.add(item.value); break;
      case 'hashtag': hashtags.add(item.value.toLowerCase()); break;
      case 'word': if (item.value) words.push(item.value.toLowerCase()); break;
    }
  }

  const inMutedThread = (event: NostrEvent): boolean => {
    if (threads.size === 0) return false;
    if (threads.has(event.id)) return true;

    // A NIP-10 reply names the thread in its `e` tags; a NIP-22 comment names
    // the parent in `e` and the thread root in `E`, so both have to be checked
    // or muting a thread would miss every reply below the first level.
    // NIP-10 `mention` e-tags are inline quotes, not thread references.
    for (const [name, value, , marker] of event.tags) {
      if (((name === 'e' && marker !== 'mention') || name === 'E') && value && threads.has(value)) {
        return true;
      }
    }
    return false;
  };

  const hasMutedWord = (event: NostrEvent): boolean => {
    if (words.length === 0) return false;
    const text = mutableText(event);
    return words.some((word) => text.includes(word));
  };

  const isMuted = (event: NostrEvent, options?: MuteCheckOptions): boolean => {
    // A zap receipt is muted by its sender or by the wallet service that signed it.
    if (pubkeys.has(event.pubkey) || pubkeys.has(muteAuthor(event))) return true;

    if (inMutedThread(event)) return true;

    // Content-based mutes (hashtags, words) can be skipped, e.g. for follows.
    if (options?.skipContentMutes) return false;

    if (hashtags.size > 0) {
      for (const [name, value] of event.tags) {
        if (name === 't' && value && hashtags.has(value.toLowerCase())) return true;
      }
    }

    return hasMutedWord(event);
  };

  return { isMuted, hasMutedWord, inMutedThread, wordsKey: [...new Set(words)].sort().join('\n') };
}

/**
 * Who an event is from, as far as muting goes: for a lightning zap, the
 * sender, not the wallet service that signs the receipt.
 */
export function muteAuthor(event: NostrEvent): string {
  return event.kind === 9735 ? getZapSenderPubkey(event) : event.pubkey;
}

/**
 * Check if an event should be muted based on mute list items. To check many
 * events against one list, compile it once with {@link createMuteMatcher}.
 */
export function isEventMuted(
  event: NostrEvent,
  muteItems: MuteListItem[],
  options?: MuteCheckOptions,
): boolean {
  return createMuteMatcher(muteItems).isMuted(event, options);
}

/** Profile fields shown to people, matched instead of the raw kind 0 JSON. */
const PROFILE_TEXT_FIELDS = ['name', 'display_name', 'about', 'nip05', 'website'];

/** Tags whose value is text a client shows in place of, or beside, the content. */
const TEXT_TAGS = new Set(['title', 'summary', 'name', 'description', 'subject', 'location', 'content-warning']);

/** Each event's matchable text, so re-checking it on every render is a lookup. */
const textCache = new WeakMap<NostrEvent, string>();

/**
 * The lowercased text muted words are matched against: the content plus the
 * visible text some kinds keep in tags (titles, summaries, poll options, image
 * alt text). A profile matches on its name, bio, and other visible fields, not
 * the JSON keys. A reaction's `+` or empty content is a 👍 like, so a muted 👍
 * hides those too.
 */
function mutableText(event: NostrEvent): string {
  let text = textCache.get(event);
  if (text === undefined) {
    text = buildMutableText(event);
    textCache.set(event, text);
  }
  return text;
}

/**
 * The lowercased text muted words are matched against in a kind 0's content:
 * the name, bio, and other visible fields, not the JSON keys.
 */
export function profileMutableText(content: string): string {
  try {
    const metadata: unknown = JSON.parse(content);
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
  return content.toLowerCase();
}

function buildMutableText(event: NostrEvent): string {
  if (event.kind === 7) {
    const content = event.content.trim();
    if (content === '+' || content === '') return '👍';
  }

  if (event.kind === 0) return profileMutableText(event.content);

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

  const matcher = createMuteMatcher(muteItems);
  return events.filter((event) => !matcher.isMuted(event));
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
