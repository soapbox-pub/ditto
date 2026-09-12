/**
 * `window.napp` — the notification bridge a host app injects into an nsite.
 *
 * Tenna (the Android nsite browser) defines it before any of the site's own
 * scripts run, and only while a user is logged in. It is absent on the web and
 * on iOS, so every use is feature-detected through `getNappPush()`.
 *
 * A subscription is nothing new on the wire: it is an ordinary `REQ` the host
 * keeps open on the site's behalf while the site is closed, delivering matches
 * to the site's service worker as `push` events. See `public/sw.js`.
 */

import type { NostrFilter } from '@nostrify/nostrify';

export interface NappSubscription {
  filters: NostrFilter[];
  relays: string[];
}

export interface NappPush {
  /** Replace the site's subscriptions. An empty array clears them. */
  set(subscriptions: NappSubscription[]): Promise<void>;
  /** The subscriptions as stored, after the host's normalization. */
  get(): Promise<NappSubscription[]>;
}

declare global {
  interface Window {
    readonly napp?: {
      readonly push?: NappPush;
    };
  }
}

/**
 * Host-enforced limits. Exceeding any of them makes `set()` reject, so the
 * adapter trims to them before calling.
 */
export const NAPP_LIMITS = {
  subscriptions: 10,
  filtersPerSubscription: 10,
  relaysPerSubscription: 10,
  /** Entries in one filter list (`authors`, `#p`, …). */
  filterEntries: 500,
} as const;

/** The push bridge, or undefined when the site isn't running inside a host. */
export function getNappPush(): NappPush | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.napp?.push;
}
