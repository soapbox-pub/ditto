/**
 * The one push adapter, over any transport.
 *
 * It owns the part every transport shares: building the subscriptions from the
 * user's preferences, relays and follow set, and keeping the service worker's
 * copy of that state current. The `PushHost` it wraps owns only the transport.
 */

import { buildPushSubscriptions } from '@/lib/push/subscriptions';
import { clearPushWorkerState, putPushWorkerState } from '@/lib/push/workerState';
import type { NappSubscription } from '@/lib/push/napp';
import type { PushContext, PushHost, PushTransport } from '@/lib/push/types';

/** Fingerprint of the last set that landed, so an unchanged one is skipped. */
const APPLIED_KEY = 'ditto-push-applied';

/** FNV-1a, hex. Only has to tell one set of inputs from the next. */
function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export class PushAdapter {
  private enabled = false;

  constructor(private readonly host: PushHost) {}

  get transport(): PushTransport {
    return this.host.transport;
  }

  get supported(): boolean {
    return this.host.supported;
  }

  get needsBrowserPermission(): boolean {
    return this.host.needsBrowserPermission;
  }

  get followsSyncedSetting(): boolean {
    return this.host.followsSyncedSetting;
  }

  /** Bring the host up and restore whether it was already subscribed. */
  async init(): Promise<void> {
    if (!this.host.supported) return;
    this.enabled = await this.host.init();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  requestPermission(): Promise<NotificationPermission> {
    return this.host.requestPermission();
  }

  /** Subscribe. Call from a user gesture, after `requestPermission()`. */
  async enable(context: PushContext): Promise<void> {
    if (!this.host.supported) return;
    await this.apply(context);
    this.enabled = true;
  }

  /**
   * Re-apply the context to live subscriptions. No-op when not enabled, or
   * when nothing it would send has changed since the last time it landed.
   */
  async sync(context: PushContext): Promise<void> {
    if (!this.enabled) return;
    await this.apply(context, { skipIfUnchanged: true });
  }

  /** Unsubscribe and forget any service- or host-side registration. */
  async disable(): Promise<void> {
    this.enabled = false;
    localStorage.removeItem(APPLIED_KEY);
    await this.host.clear();
    if (this.host.usesServiceWorker) await clearPushWorkerState().catch(() => {});
  }

  /** Keep an expiring registration alive. No-op when not enabled. */
  async keepAlive(context: PushContext): Promise<void> {
    if (!this.enabled) return;
    const lapsed = await this.host.keepAlive?.();
    if (lapsed) await this.apply(context);
  }

  destroy(): void {
    this.host.destroy();
  }

  private async apply(context: PushContext, { skipIfUnchanged = false } = {}): Promise<void> {
    const subscriptions = buildPushSubscriptions(context);

    // Everything the host and the worker are given, so a change to any of it
    // goes through. The follow set counts even when it isn't in a filter: the
    // worker and the native spam detectors read it.
    const applied = fingerprint(JSON.stringify([
      this.host.transport,
      context.pubkey,
      subscriptions,
      context.follows ?? [],
      context.prefs?.onlyFollowing === true,
      context.style ?? 'push',
    ]));
    if (skipIfUnchanged && localStorage.getItem(APPLIED_KEY) === applied) return;

    // Started, not awaited: the host decides whether the write must land
    // before its `set()` (a push can arrive the moment that returns) or after
    // a browser call that has to stay first in the user gesture.
    const workerReady = this.host.usesServiceWorker
      ? this.writeWorkerState(context, subscriptions)
      : Promise.resolve();
    await Promise.all([workerReady, this.host.set(subscriptions, { context, workerReady })]);
    localStorage.setItem(APPLIED_KEY, applied);
  }

  private async writeWorkerState(
    { pubkey, prefs, follows = [] }: PushContext,
    subscriptions: NappSubscription[],
  ): Promise<void> {
    try {
      await putPushWorkerState({
        pubkey,
        subscriptions,
        follows,
        onlyFollowing: prefs?.onlyFollowing === true,
      });
    } catch (err) {
      // Not fatal: without it the worker shows everything the filters matched.
      console.warn('[push] Failed to persist worker state:', err);
    }
  }
}
