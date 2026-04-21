import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { NSecSigner } from '@nostrify/nostrify';
import { BlossomUploader } from '@nostrify/nostrify/uploaders';

import { getEffectiveBlossomServers } from '@/lib/appBlossom';

import type { NostrEvent, NostrSigner } from '@nostrify/nostrify';
import type { ToolContext } from './Tool';

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

/** Get the buddy secret key or generate an ephemeral one. */
export function getBuddyOrEphemeralKey(getBuddySecretKey: () => Uint8Array | null) {
  const buddySk = getBuddySecretKey();
  const sk = buddySk ?? generateSecretKey();
  return { sk, pubkey: getPublicKey(sk), isBuddy: !!buddySk };
}

/**
 * Sign and publish a Nostr event, plus a throwaway kind-0 profile when using
 * an ephemeral key (buddy already has a profile).
 */
export async function signAndPublishWithProfile(
  nostr: ToolContext['nostr'],
  sk: Uint8Array,
  isBuddy: boolean,
  event: { kind: number; content: string; tags: string[][]; created_at: number },
  profileMeta: { name: string; about: string },
): Promise<NostrEvent> {
  const signed = finalizeEvent(event, sk) as NostrEvent;
  const publishes: Promise<void>[] = [
    nostr.event(signed, { signal: AbortSignal.timeout(5000) }),
  ];
  if (!isBuddy) {
    const profileEvent = finalizeEvent({
      kind: 0,
      content: JSON.stringify(profileMeta),
      tags: [],
      created_at: event.created_at,
    }, sk) as NostrEvent;
    publishes.push(nostr.event(profileEvent, { signal: AbortSignal.timeout(5000) }));
  }
  await Promise.all(publishes);
  return signed;
}

/** Create a BlossomUploader configured with buddy or user signer. */
export function createBuddyUploader(
  getBuddySecretKey: () => Uint8Array | null,
  userSigner: NostrSigner,
  config: ToolContext['config'],
): BlossomUploader {
  const buddySk = getBuddySecretKey();
  const signer = buddySk ? new NSecSigner(buddySk) : userSigner;
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
