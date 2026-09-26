/**
 * Push transport selection.
 *
 * Every transport takes the same subscriptions (see `types.ts`); this only
 * decides who carries them. The native apps use their own plugin. Inside a
 * napp host (Tenna) the host carries them, since it already holds relay
 * connections — or its own push service — for every site it runs. Everywhere
 * else it is Web Push through the nostr-push service.
 */

import { Capacitor } from '@capacitor/core';

import { NappHost } from '@/lib/push/NappHost';
import { NativeHost } from '@/lib/push/native';
import { NostrPushHost } from '@/lib/push/NostrPushHost';
import { PushAdapter } from '@/lib/push/PushAdapter';

export type { PushContext, PushHost, PushPreferences, PushTransport } from '@/lib/push/types';
export { PushAdapter } from '@/lib/push/PushAdapter';
export { buildPushSubscriptions } from '@/lib/push/subscriptions';

/** Hex pubkey of the nostr-push service, from the build environment. */
const NOSTR_PUSH_PUBKEY: string = import.meta.env.VITE_NOSTR_PUSH_PUBKEY ?? '';

/**
 * The best push transport available here.
 *
 * Always returns an adapter — check `.supported` before using it, since the
 * nostr-push fallback is unsupported in browsers without Web Push and in builds
 * with no service pubkey configured.
 */
export function createPushAdapter(): PushAdapter {
  if (Capacitor.isNativePlatform()) return new PushAdapter(new NativeHost());

  const napp = new NappHost();
  if (napp.supported) return new PushAdapter(napp);

  return new PushAdapter(new NostrPushHost(NOSTR_PUSH_PUBKEY));
}
