/**
 * napp transport — notifications through `window.napp.push`.
 *
 * The host app (Tenna) keeps our filters watched while Ditto is closed: as
 * ordinary `REQ`s it holds open on Android, and through a push service on iOS.
 * Matches are delivered to `public/sw.js` as `push` events carrying the raw
 * Nostr event — or, when a push is too small to hold one, its id and the relays
 * to fetch it from.
 *
 * Consent is the host's. The first non-empty `set()` prompts the user
 * ("Send notifications") and then asks the OS for its notification permission;
 * either refusal rejects `set()` with an `Error`. Clearing with `set([])` never
 * prompts.
 */

import { getNappPush, type NappSubscription } from '@/lib/push/napp';
import { registerPushWorker } from '@/lib/push/serviceWorker';
import type { PushHost, PushSetOptions } from '@/lib/push/types';

export class NappHost implements PushHost {
  readonly transport = 'napp' as const;
  readonly supported = !!getNappPush();
  /** The host prompts for consent inside `set()`; there is nothing to ask here. */
  readonly needsBrowserPermission = false;
  readonly usesServiceWorker = true;
  readonly followsSyncedSetting = false;

  async init(): Promise<boolean> {
    const push = getNappPush();
    if (!push) return false;

    await registerPushWorker();

    try {
      const existing = await push.get();
      return existing.length > 0;
    } catch (err) {
      console.warn('[push] Failed to read napp subscriptions:', err);
      return false;
    }
  }

  async requestPermission(): Promise<NotificationPermission> {
    // Consent lives in the host and is asked for by `set()`. Reporting
    // 'granted' keeps the caller's gesture flow unbranched; a refusal surfaces
    // as a rejection from `enable()`.
    return 'granted';
  }

  async set(subscriptions: NappSubscription[], { workerReady }: PushSetOptions): Promise<void> {
    const push = getNappPush();
    if (!push) return;
    // Write the worker's copy first: a push can arrive the moment `set()`
    // returns, and the worker drops events it can't match to a user.
    await workerReady;
    await push.set(subscriptions);
  }

  async clear(): Promise<void> {
    await getNappPush()?.set([]);
  }

  destroy(): void {}
}
