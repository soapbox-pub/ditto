import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { genUserName } from '@/lib/genUserName';

const LAST_SEEN_KEY = 'nostr:notification-last-seen';
const POLL_INTERVAL = 15 * 60 * 1000; // 15 minutes

/** Action type derived from Nostr event kind. */
type NotificationAction = 'reacted to your post' | 'reposted your note' | 'zapped you' | 'mentioned you' | 'replied to you';

/** Map an event kind to a human-readable action string. */
function kindToAction(event: NostrEvent): NotificationAction {
  switch (event.kind) {
    case 7:
      return 'reacted to your post';
    case 6:
      return 'reposted your note';
    case 9735:
      return 'zapped you';
    case 1: {
      // Distinguish replies from mentions: if the event has an 'e' tag, it's a reply
      const hasETag = event.tags.some(([name]) => name === 'e');
      return hasETag ? 'replied to you' : 'mentioned you';
    }
    default:
      return 'mentioned you';
  }
}

/** Get the last-seen timestamp from localStorage. Returns 0 if never set. */
export function getLastSeenTimestamp(): number {
  try {
    const stored = localStorage.getItem(LAST_SEEN_KEY);
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
}

/** Persist the last-seen timestamp. */
export function setLastSeenTimestamp(timestamp: number): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, timestamp.toString());
  } catch {
    // localStorage unavailable
  }
}

/** Resolve a display name for a pubkey. Tries NIP-05, falls back to name, then generated name. */
function resolveDisplayName(metadata: NostrMetadata | undefined, pubkey: string): string {
  if (metadata?.nip05) {
    // Strip the leading underscore convention: _@domain -> domain
    const nip05 = metadata.nip05;
    if (nip05.startsWith('_@')) {
      return nip05.slice(2);
    }
    return nip05;
  }
  if (metadata?.display_name) return metadata.display_name;
  if (metadata?.name) return metadata.name;
  return genUserName(pubkey);
}

/**
 * Fetch new notification events from relays via raw WebSocket.
 * This avoids depending on React context so it can run from a timer/background.
 */
export async function fetchNewNotifications(
  relayUrls: string[],
  userPubkey: string,
  since: number,
): Promise<NostrEvent[]> {
  const events: NostrEvent[] = [];
  const seenIds = new Set<string>();

  const filter = {
    kinds: [1, 6, 7, 9735],
    '#p': [userPubkey],
    since: since + 1, // Only events strictly after `since`
    limit: 50,
  };

  // Query up to 2 relays in parallel to avoid hammering all relays
  const relaysToQuery = relayUrls.slice(0, 2);

  const results = await Promise.allSettled(
    relaysToQuery.map((url) => queryRelay(url, filter)),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const event of result.value) {
        // Skip self-interactions
        if (event.pubkey === userPubkey) continue;
        if (!seenIds.has(event.id)) {
          seenIds.add(event.id);
          events.push(event);
        }
      }
    }
  }

  return events.sort((a, b) => b.created_at - a.created_at);
}

/** Open a raw WebSocket to a single relay, send a REQ, collect events, close. */
function queryRelay(url: string, filter: Record<string, unknown>): Promise<NostrEvent[]> {
  return new Promise((resolve) => {
    const events: NostrEvent[] = [];
    const subId = 'notif-' + Math.random().toString(36).slice(2, 8);
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws.close(); } catch { /* ignore */ }
        resolve(events);
      }
    }, 8000);

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      clearTimeout(timeout);
      resolve([]);
      return;
    }

    ws.onopen = () => {
      ws.send(JSON.stringify(['REQ', subId, filter]));
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (Array.isArray(data)) {
          if (data[0] === 'EVENT' && data[1] === subId && data[2]) {
            events.push(data[2] as NostrEvent);
          } else if (data[0] === 'EOSE' && data[1] === subId) {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              ws.send(JSON.stringify(['CLOSE', subId]));
              ws.close();
              resolve(events);
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(events);
      }
    };

    ws.onclose = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(events);
      }
    };
  });
}

/** Fetch kind-0 metadata for a set of pubkeys from relays. */
export async function fetchAuthorMetadata(
  relayUrls: string[],
  pubkeys: string[],
): Promise<Map<string, NostrMetadata>> {
  if (pubkeys.length === 0) return new Map();

  const metadataMap = new Map<string, NostrMetadata>();
  const filter = {
    kinds: [0],
    authors: pubkeys,
    limit: pubkeys.length,
  };

  const relayUrl = relayUrls[0];
  if (!relayUrl) return metadataMap;

  try {
    const events = await queryRelay(relayUrl, filter);
    for (const event of events) {
      try {
        const metadata = JSON.parse(event.content) as NostrMetadata;
        // Only store if we haven't seen this pubkey or this event is newer
        if (!metadataMap.has(event.pubkey)) {
          metadataMap.set(event.pubkey, metadata);
        }
      } catch {
        // Ignore unparseable metadata
      }
    }
  } catch {
    // Relay query failed, return what we have
  }

  return metadataMap;
}

/**
 * Process new events into native device notifications.
 * Resolves NIP-05 display names and dispatches via Capacitor LocalNotifications.
 */
export async function dispatchNativeNotifications(
  events: NostrEvent[],
  relayUrls: string[],
): Promise<void> {
  if (events.length === 0) return;
  if (!Capacitor.isNativePlatform()) return;

  // Collect unique pubkeys to resolve display names
  const pubkeys = [...new Set(events.map((e) => {
    // For zap receipts, try to get the actual sender
    if (e.kind === 9735) {
      const pTag = e.tags.find(([name]) => name === 'P');
      if (pTag?.[1]) return pTag[1];
      const descTag = e.tags.find(([name]) => name === 'description');
      if (descTag?.[1]) {
        try {
          const zapRequest = JSON.parse(descTag[1]);
          if (zapRequest.pubkey) return zapRequest.pubkey as string;
        } catch { /* ignore */ }
      }
    }
    return e.pubkey;
  }))];

  // Fetch metadata to resolve NIP-05 / display names
  const metadataMap = await fetchAuthorMetadata(relayUrls, pubkeys);

  // Build notifications
  const notifications = events.map((event) => {
    let actorPubkey = event.pubkey;
    if (event.kind === 9735) {
      const pTag = event.tags.find(([name]) => name === 'P');
      if (pTag?.[1]) actorPubkey = pTag[1];
      else {
        const descTag = event.tags.find(([name]) => name === 'description');
        if (descTag?.[1]) {
          try {
            const zapRequest = JSON.parse(descTag[1]);
            if (zapRequest.pubkey) actorPubkey = zapRequest.pubkey;
          } catch { /* ignore */ }
        }
      }
    }

    const metadata = metadataMap.get(actorPubkey);
    const displayName = resolveDisplayName(metadata, actorPubkey);
    const action = kindToAction(event);

    return {
      id: hashEventId(event.id),
      title: 'Mew',
      body: `${displayName} ${action}`,
      smallIcon: 'ic_stat_mew',
      largeIcon: metadata?.picture,
      extra: { eventId: event.id },
    };
  });

  // Group notifications if there are many (>3), send a summary instead
  if (notifications.length > 3) {
    await LocalNotifications.schedule({
      notifications: [{
        id: hashEventId(events[0].id + '-summary'),
        title: 'Mew',
        body: `You have ${notifications.length} new notifications`,
        smallIcon: 'ic_stat_mew',
      }],
    });
  } else {
    await LocalNotifications.schedule({ notifications });
  }
}

/** Convert a hex event ID to a stable 32-bit integer for notification IDs. */
function hashEventId(id: string): number {
  let hash = 0;
  for (let i = 0; i < Math.min(id.length, 16); i++) {
    const char = id.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) % 2147483647 || 1; // Ensure positive non-zero
}

/** The background poll interval handle. */
let pollIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Start the background polling loop.
 * Polls relays every 15 minutes for new notifications and dispatches native notifications.
 */
export function startBackgroundPoll(
  relayUrls: string[],
  userPubkey: string,
): void {
  stopBackgroundPoll();

  pollIntervalId = setInterval(async () => {
    try {
      const since = getLastSeenTimestamp();
      const events = await fetchNewNotifications(relayUrls, userPubkey, since);

      if (events.length > 0) {
        await dispatchNativeNotifications(events, relayUrls);
        // Update last-seen to the newest event
        const newestTs = Math.max(...events.map((e) => e.created_at));
        setLastSeenTimestamp(newestTs);
      }
    } catch (error) {
      console.warn('[NotificationService] Background poll failed:', error);
    }
  }, POLL_INTERVAL);
}

/** Stop the background polling loop. */
export function stopBackgroundPoll(): void {
  if (pollIntervalId !== null) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
}
