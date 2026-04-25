import { getPublicKey, finalizeEvent } from 'nostr-tools';
import { NSecSigner } from '@nostrify/nostrify';
import { BlossomUploader } from '@nostrify/nostrify/uploaders';

import { getEffectiveBlossomServers } from '@/lib/appBlossom';

import type { NostrEvent } from '@nostrify/nostrify';
import type { ToolContext } from './Tool';

export const BUDDY_KEY_UNAVAILABLE_ERROR = 'Buddy key is unavailable. Open Buddy once to restore the key, then try again.';

/** Fetch the logged-in user's contact list pubkeys (kind 3 `p` tags). */
export async function fetchContactPubkeys(ctx: ToolContext): Promise<string[]> {
  if (!ctx.user) return [];
  try {
    const contactEvents = await ctx.nostr.query(
      [{ kinds: [3], authors: [ctx.user.pubkey], limit: 1 }],
      { signal: AbortSignal.timeout(5000) },
    );
    return contactEvents[0]?.tags
      .filter(([t]) => t === 'p')
      .map(([, pk]) => pk) ?? [];
  } catch {
    return [];
  }
}

/** Get the buddy secret key, or null when it cannot be restored. */
export function getBuddyKey(getBuddySecretKey: () => Uint8Array | null) {
  const buddySk = getBuddySecretKey();
  return buddySk ? { sk: buddySk, pubkey: getPublicKey(buddySk) } : null;
}

/** Sign and publish a Nostr event with the buddy key. */
export async function signAndPublishAsBuddy(
  nostr: ToolContext['nostr'],
  sk: Uint8Array,
  event: { kind: number; content: string; tags: string[][]; created_at: number },
): Promise<NostrEvent> {
  const signed = finalizeEvent(event, sk) as NostrEvent;
  await nostr.event(signed, { signal: AbortSignal.timeout(5000) });
  return signed;
}

/** Create a BlossomUploader configured with the buddy signer. */
export function createBuddyUploader(
  buddySk: Uint8Array,
  config: ToolContext['config'],
): BlossomUploader {
  const signer = new NSecSigner(buddySk);
  const servers = getEffectiveBlossomServers(config.blossomServerMetadata, config.useAppBlossomServers);
  return new BlossomUploader({
    servers,
    signer,
    fetch: (input, init) => globalThis.fetch(input, {
      ...init,
      // Hard 30s cap; if the caller provides a signal, race both
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
    }),
  });
}
