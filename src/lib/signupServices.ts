import { useMemo } from 'react';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { useLoginActions } from '@/hooks/useLoginActions';

import { saveNsec } from '@/lib/credentialManager';
import { useNostrPublish } from '@/hooks/useNostrPublish';

/**
 * The external effects of signup, behind one narrow seam.
 *
 * Signup's screens are one thing and its *effects* — generating a key, adding
 * the account, publishing a kind 0 and a kind 3 — are another. Collecting them
 * behind this interface keeps the components free of that machinery: they ask
 * for the services and call them, and the screens can be exercised against a
 * stand-in without a `devMode` flag threaded through the component tree.
 *
 * ### Why the pending flags are part of the interface
 *
 * A screen that publishes through this seam has to be able to disable its own
 * Continue button while that publish is in flight. Reading `isPending` from a
 * separately-constructed `useNostrPublish()` does not do that — it reports on a
 * mutation nobody called, so it is permanently false and the button stays live
 * through the whole round-trip. The flags below therefore come from the exact
 * mutation the matching method runs.
 */
export interface SignupAccount {
  /** What the key screen should display. */
  secretDisplay: string;
  /** The nsec to persist, or `undefined` when there is nothing real to save. */
  nsec?: string;
  /** Hex pubkey of the new account. */
  pubkey: string;
}

export interface SignupServices {
  /** Create the account identity for this signup run. */
  generateAccount(): SignupAccount;
  /**
   * Save the key to the device and make the account active.
   *
   * This is the step where production logs in — several screens before signup
   * finishes — which is exactly the ordering that broke the arrival handoff.
   * Both implementations preserve it.
   */
  persistAccount(
    account: SignupAccount,
    appName: string,
  ): Promise<'saved' | 'dismissed' | 'saved-to-file'>;
  /** Publish the kind 0 metadata built by the profile step. */
  publishProfile(content: Record<string, unknown>): Promise<void>;
  /** Publish the kind 3 follow list built by the follows step. */
  publishFollows(event: {
    content: string;
    tags: string[][];
    prev?: unknown;
  }): Promise<void>;
  /**
   * Whether the publish `publishProfile` performs is in flight right now.
   *
   * Only the profile step needs this from the seam. The follows step owns a
   * `submitting` flag that already spans its own awaited publish, so exposing a
   * second flag it would never read would just be dead API.
   */
  isPublishingProfile: boolean;
}

/**
 * The services signup uses: real keys, real login, real publishes.
 *
 * Two separate publish mutations rather than one shared instance, so
 * `isPublishingProfile` cannot be set by a follow-list publish and vice versa.
 * The steps are sequential today, but a flag that reports on the wrong
 * operation is precisely the defect this interface exists to prevent.
 */
export function useSignupServices(): SignupServices {
  const login = useLoginActions();
  const profilePublish = useNostrPublish();
  const followsPublish = useNostrPublish();
  const { mutateAsync: publishProfileEvent, isPending: isPublishingProfile } = profilePublish;
  const { mutateAsync: publishFollowsEvent } = followsPublish;

  const operations = useMemo(
    () => ({
      generateAccount() {
        const sk = generateSecretKey();
        const nsec = nip19.nsecEncode(sk);
        return { secretDisplay: nsec, nsec, pubkey: getPublicKey(sk) };
      },
      async persistAccount(account: SignupAccount, appName: string) {
        if (!account.nsec) throw new Error('Missing nsec');
        const npub = nip19.npubEncode(account.pubkey);
        const result = await saveNsec(npub, account.nsec, appName);
        login.nsec(account.nsec);
        return result;
      },
      async publishProfile(content: Record<string, unknown>) {
        await publishProfileEvent({ kind: 0, content: JSON.stringify(content), tags: [] });
      },
      async publishFollows(event: { content: string; tags: string[][]; prev?: unknown }) {
        await publishFollowsEvent({
          kind: 3,
          content: event.content,
          tags: event.tags,
          prev: event.prev as never,
        });
      },
    }),
    [login, publishProfileEvent, publishFollowsEvent],
  );

  return useMemo(
    () => ({ ...operations, isPublishingProfile }),
    [operations, isPublishingProfile],
  );
}
