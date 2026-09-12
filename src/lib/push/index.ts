/**
 * Push transport selection.
 *
 * napp wins wherever a host app provides it: the host already holds the relay
 * connections, so there is no third-party push service in the path, no VAPID
 * key to fetch, and no server that has to be told who the user follows. It is
 * only ever present inside such a host (today: Tenna on Android), so everywhere
 * else this falls through to nostr-push.
 */

import { NappPushAdapter } from '@/lib/push/NappPushAdapter';
import { NostrPushAdapter } from '@/lib/push/NostrPushAdapter';
import type { PushAdapter } from '@/lib/push/types';

export type { PushAdapter, PushContext, PushPreferences, PushTransport } from '@/lib/push/types';
export { NappPushAdapter, buildNappSubscriptions } from '@/lib/push/NappPushAdapter';
export { NostrPushAdapter } from '@/lib/push/NostrPushAdapter';

/** Hex pubkey of the nostr-push server, from the build environment. */
const NOSTR_PUSH_PUBKEY: string = import.meta.env.VITE_NOSTR_PUSH_PUBKEY ?? '';

/**
 * The best push transport available here.
 *
 * Always returns an adapter — check `.supported` before using it, since the
 * nostr-push fallback is unsupported in browsers without Web Push and in builds
 * with no server pubkey configured.
 */
export function createPushAdapter(): PushAdapter {
  const napp = new NappPushAdapter();
  if (napp.supported) return napp;

  const domain = typeof window !== 'undefined' ? window.location.hostname : '';
  return new NostrPushAdapter(NOSTR_PUSH_PUBKEY, domain);
}
