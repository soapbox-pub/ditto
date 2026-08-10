import { useMemo } from 'react';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { useLoginActions } from '@/hooks/useLoginActions';

import { saveNsec } from '@/lib/credentialManager';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useDevSignupServices } from '@/dev/devSignupServices';
import { devSignupServicesActive } from '@/dev/devSignupArrival';

/**
 * The external effects of signup, behind one narrow seam.
 *
 * Signup's *screens* are worth exercising repeatedly — pacing, validation,
 * responsive behaviour, the order of steps, and the handoff to the arrival at
 * the end. Its *effects* are not: each rehearsal generates a real key, adds a
 * real account, and publishes a real kind 0 and kind 3 to public relays.
 *
 * So the UI and the state machine stay exactly as they are, shared with
 * production, and only these operations are swapped. The localhost dev tool
 * injects an implementation that does none of them; production is unchanged and
 * is the default everywhere else.
 *
 * Deliberately not a `devMode` flag threaded through the signup components:
 * the components ask for the services and do not know or care which
 * implementation they got.
 *
 * ### Why the pending flags are part of the interface
 *
 * A screen that publishes through this seam has to be able to disable its own
 * Continue button while that publish is in flight. Reading `isPending` from a
 * separately-constructed `useNostrPublish()` does not do that — it reports on a
 * mutation nobody called, so it is permanently false and the button stays live
 * through the whole round-trip. The flags below therefore come from the exact
 * mutation the matching method runs, in whichever implementation is active.
 */
export interface SignupAccount {
  /** What the key screen should display. Never a usable secret in dev. */
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
 * Production: real keys, real login, real publishes.
 *
 * Two separate publish mutations rather than one shared instance, so
 * `isPublishingProfile` cannot be set by a follow-list publish and vice versa.
 * The steps are sequential today, but a flag that reports on the wrong
 * operation is precisely the defect this interface exists to prevent.
 */
function useRealSignupServices(): SignupServices {
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

/**
 * The services signup should use right now.
 *
 * Both implementations are constructed (hooks cannot be conditional) but only
 * one is returned. Constructing the real one publishes nothing — it only builds
 * two idle mutations — so this costs nothing in the dev case.
 *
 * `import.meta.env.DEV` is statically false in a production build and
 * `devSignupServicesActive()` is additionally false off localhost, so a
 * deployed build always resolves to the real implementation. Note that this
 * gates *behaviour*, not bundling: the dev module is still imported here, so it
 * is still emitted into the bundle — it is simply unreachable at runtime.
 */
export function useSignupServices(): SignupServices {
  const real = useRealSignupServices();
  const dev = useDevSignupServices();
  return import.meta.env.DEV && devSignupServicesActive() ? dev : real;
}
