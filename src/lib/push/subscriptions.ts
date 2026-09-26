/**
 * The filters Ditto asks every push transport to watch.
 *
 * Built once, in napp's `NappSubscription[]` shape, and handed unchanged to
 * whichever `PushHost` is in play — Tenna's `window.napp.push`, the nostr-push
 * service, or the native plugin. What differs between them is only who holds
 * the relay subscription and how the event reaches a renderer.
 */

import type { NostrFilter } from '@nostrify/nostrify';

import { getEnabledNotificationTypes } from '@/lib/notificationKinds';
import { NAPP_LIMITS, type NappSubscription } from '@/lib/push/napp';
import type { PushContext } from '@/lib/push/types';

/** Strip trailing slashes and drop anything that isn't a relay URL. */
export function normalizeRelays(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') continue;
    const normalized = parsed.toString().replace(/\/+$/, '');
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * One filter per enabled notification type, packed into subscriptions.
 *
 * Returns `[]` when there is nothing to watch — no relays, or every type
 * switched off — which clears the subscriptions without clearing the adapter's
 * own enabled flag, so flipping a type back on resubscribes.
 */
export function buildPushSubscriptions({ pubkey, prefs, relays = [], follows = [] }: PushContext): NappSubscription[] {
  const relayUrls = normalizeRelays(relays).slice(0, NAPP_LIMITS.relaysPerSubscription);
  if (!relayUrls.length) return [];

  // Above the cap the `authors` list is dropped rather than truncated: the
  // renderer re-checks the follow set (`public/sw.js` against its IndexedDB
  // copy, the native pollers against theirs), so the filtering still happens,
  // one hop later. Truncating would instead silently lose notifications from
  // everyone past the 500th follow.
  const onlyFollowing = prefs?.onlyFollowing === true;
  const authors = onlyFollowing && follows.length > 0 && follows.length <= NAPP_LIMITS.filterEntries
    ? follows
    : undefined;

  const filters: NostrFilter[] = getEnabledNotificationTypes(prefs).map((type) => ({
    kinds: type.kinds,
    '#p': [pubkey],
    ...(authors ? { authors } : {}),
  }));

  if (!filters.length) return [];

  return chunk(filters, NAPP_LIMITS.filtersPerSubscription)
    .slice(0, NAPP_LIMITS.subscriptions)
    .map((group) => ({ filters: group, relays: relayUrls }));
}
