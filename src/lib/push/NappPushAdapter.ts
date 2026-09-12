/**
 * napp transport — notifications through `window.napp.push`.
 *
 * The host app (Tenna) keeps one relay connection per relay any site named and
 * holds our filters open as ordinary `REQ`s while Ditto is closed. Matches are
 * delivered to `public/sw.js` as `push` events carrying the raw Nostr event, so
 * unlike nostr-push there is no server rendering the text and no notification
 * template to register — the worker draws the notification itself.
 *
 * What this adapter owns is the filter set: one filter per enabled notification
 * type, scoped to events tagging the user, packed into as few subscriptions as
 * the host's limits allow.
 *
 * Consent is the host's. The first non-empty `set()` prompts the user
 * ("Send notifications") and then asks the OS for its notification permission;
 * either refusal rejects `set()` with an `Error`. Clearing with `set([])` never
 * prompts.
 */

import type { NostrFilter } from '@nostrify/nostrify';

import { NOTIFICATION_TEMPLATES } from '@/lib/notificationTemplates';
import { getNappPush, NAPP_LIMITS, type NappSubscription } from '@/lib/push/napp';
import { clearNappWorkerState, putNappWorkerState } from '@/lib/push/nappWorkerState';
import type { PushAdapter, PushContext, PushPreferences } from '@/lib/push/types';

/** Maps notification template IDs to preference keys. */
const TEMPLATE_ID_TO_PREF_KEY: Record<string, keyof PushPreferences> = {
  reactions: 'reactions',
  reposts: 'reposts',
  zaps: 'zaps',
  mentions: 'mentions',
  comments: 'comments',
  badges: 'badges',
  letters: 'letters',
  highlights: 'highlights',
  quizzes: 'quizzes',
};

/** Strip trailing slashes and drop anything that isn't a relay URL. */
function normalizeRelays(urls: string[]): string[] {
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
 * switched off — which clears the site's subscriptions without clearing the
 * adapter's own enabled flag, so flipping a type back on resubscribes.
 */
export function buildNappSubscriptions({ pubkey, prefs, relays = [], follows = [] }: PushContext): NappSubscription[] {
  const relayUrls = normalizeRelays(relays).slice(0, NAPP_LIMITS.relaysPerSubscription);
  if (!relayUrls.length) return [];

  // Above the host's cap the `authors` list is dropped rather than truncated:
  // `public/sw.js` re-checks the follow set against its IndexedDB copy, so the
  // filtering still happens, one hop later. Truncating would instead silently
  // lose notifications from everyone past the 500th follow.
  const onlyFollowing = prefs?.onlyFollowing === true;
  const authors = onlyFollowing && follows.length > 0 && follows.length <= NAPP_LIMITS.filterEntries
    ? follows
    : undefined;

  const filters: NostrFilter[] = NOTIFICATION_TEMPLATES
    .filter((tmpl) => {
      const prefKey = TEMPLATE_ID_TO_PREF_KEY[tmpl.id];
      return prefKey ? prefs?.[prefKey] !== false : true;
    })
    .map((tmpl) => ({
      kinds: tmpl.kinds,
      '#p': [pubkey],
      ...(authors ? { authors } : {}),
    }));

  if (!filters.length) return [];

  return chunk(filters, NAPP_LIMITS.filtersPerSubscription)
    .slice(0, NAPP_LIMITS.subscriptions)
    .map((group) => ({ filters: group, relays: relayUrls }));
}

export class NappPushAdapter implements PushAdapter {
  readonly transport = 'napp' as const;
  readonly supported = !!getNappPush();
  /** The host prompts for consent inside `set()`; there is nothing to ask here. */
  readonly needsBrowserPermission = false;
  /** The filters name the relays and the follow set, so both must stay current. */
  readonly ownsSubscriptions = true;

  private enabled = false;
  private destroyed = false;

  async init(): Promise<void> {
    const push = getNappPush();
    if (!push || this.destroyed) return;

    // A site whose worker has no `push` listener gets nothing, the same as on
    // the web — so the worker has to be registered before any subscription is.
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
      } catch (err) {
        console.error('[push] SW registration failed:', err);
      }
    }
    if (this.destroyed) return;

    try {
      const existing = await push.get();
      this.enabled = existing.length > 0;
    } catch (err) {
      console.warn('[push] Failed to read napp subscriptions:', err);
    }
  }

  async isEnabled(): Promise<boolean> {
    return this.enabled;
  }

  async requestPermission(): Promise<NotificationPermission> {
    // Consent lives in the host and is asked for by `set()`. Reporting
    // 'granted' keeps the caller's gesture flow unbranched; a refusal surfaces
    // as a rejection from `enable()`.
    return 'granted';
  }

  async enable(context: PushContext): Promise<void> {
    const push = getNappPush();
    if (!push) return;

    const subscriptions = buildNappSubscriptions(context);

    // Write the worker's copy first: a push can arrive the moment `set()`
    // returns, and the worker drops events it can't match to a user.
    await this.writeWorkerState(context);
    await push.set(subscriptions);
    this.enabled = true;
  }

  async sync(context: PushContext): Promise<void> {
    if (!this.enabled) return;
    const push = getNappPush();
    if (!push) return;

    await this.writeWorkerState(context);
    await push.set(buildNappSubscriptions(context));
  }

  async disable(): Promise<void> {
    this.enabled = false;
    const push = getNappPush();
    if (push) await push.set([]);
    await clearNappWorkerState().catch(() => {});
  }

  destroy(): void {
    this.destroyed = true;
  }

  private async writeWorkerState({ pubkey, prefs, follows = [] }: PushContext): Promise<void> {
    try {
      await putNappWorkerState({
        pubkey,
        follows,
        onlyFollowing: prefs?.onlyFollowing === true,
      });
    } catch (err) {
      // Not fatal: without it the worker shows everything the filters matched.
      console.warn('[push] Failed to persist napp worker state:', err);
    }
  }
}
