import { useMemo } from 'react';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { useLoginActions } from '@/hooks/useLoginActions';

import { saveNsec } from '@/lib/credentialManager';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import {
  DEV_SIGNUP_PUBKEY,
  devSignupResolveAccount,
  devSignupServicesActive,
  recordDevSignupIntercept,
} from '@/dev/devSignupArrival';

/**
 * The external effects of signup, behind one narrow seam.
 *
 * Signup's *screens* are worth exercising repeatedly — pacing, validation,
 * responsive behaviour, the order of steps, and the handoff to the arrival at
 * the end. Its *effects* are not: each rehearsal generates a real key, adds a
 * real account, and publishes a real kind 0 and kind 3 to public relays.
 *
 * So the UI and the state machine stay exactly as they are, shared with
 * production, and only these five operations are swapped. The localhost dev
 * tool injects an implementation that does none of them; production is
 * unchanged and is the default everywhere else.
 *
 * Deliberately not a `devMode` flag threaded through the signup components:
 * the components ask for the services and do not know or care which
 * implementation they got.
 */
export interface SignupAccount {
  /** What the key screen should display. Never a usable secret in dev. */
  secretDisplay: string;
  /** The nsec to persist, or `undefined` when there is nothing real to save. */
  nsec?: string;
  /** Hex pubkey of the new account. */
  pubkey: string;
  /** Whether this is the simulated identity. Drives the dev labelling. */
  fake: boolean;
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
}

/** Production: real keys, real login, real publishes. */
function useRealSignupServices(): SignupServices {
  const login = useLoginActions();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMemo(
    () => ({
      generateAccount() {
        const sk = generateSecretKey();
        const nsec = nip19.nsecEncode(sk);
        return { secretDisplay: nsec, nsec, pubkey: getPublicKey(sk), fake: false };
      },
      async persistAccount(account, appName) {
        if (!account.nsec) throw new Error('Missing nsec');
        const npub = nip19.npubEncode(account.pubkey);
        const result = await saveNsec(npub, account.nsec, appName);
        login.nsec(account.nsec);
        return result;
      },
      async publishProfile(content) {
        await publishEvent({ kind: 0, content: JSON.stringify(content), tags: [] });
      },
      async publishFollows(event) {
        await publishEvent({
          kind: 3,
          content: event.content,
          tags: event.tags,
          prev: event.prev as never,
        });
      },
    }),
    [login, publishEvent],
  );
}

/**
 * Localhost dev tool: the same screens, none of the effects.
 *
 * Every method that would reach the network throws after recording a
 * violation, so a missed call site fails loudly on the dev page's counters
 * instead of quietly publishing. `persistAccount` is the exception — it must
 * succeed, because making the account active mid-signup is the behaviour under
 * test — and it does so by flipping the dev session's account shadow rather
 * than touching the real login store.
 */
function useDevSignupServices(): SignupServices {
  return useMemo(
    () => ({
      generateAccount() {
        return {
          // Unmistakably not a key. Never decodes, never signs, never saves.
          secretDisplay: 'nsec1-DEV-FAKE-KEY-NOT-REAL-DO-NOT-USE',
          nsec: undefined,
          pubkey: DEV_SIGNUP_PUBKEY,
          fake: true,
        };
      },
      async persistAccount() {
        // The whole point of the simulation: the account becomes available here,
        // several screens before signup completes. Shadows the current user via
        // the dev session; the real account list is never touched.
        devSignupResolveAccount();
        return 'dismissed';
      },
      async publishProfile(content) {
        // Absorbed, not failed: the screens must behave exactly as they do in
        // production, and a rejection here would show a "Profile failed" toast
        // that says nothing true about the code under review.
        recordDevSignupIntercept(
          `kind 0 not sent — fields: ${Object.keys(content).join(', ') || '(none)'}`,
        );
      },
      async publishFollows(event) {
        recordDevSignupIntercept(
          `kind 3 not sent — ${event.tags.filter((t) => t[0] === 'p').length} follows`,
        );
      },
    }),
    [],
  );
}

/**
 * The services signup should use right now.
 *
 * Both implementations are constructed (hooks cannot be conditional) but only
 * one is returned. `devSignupServicesActive()` is false in production builds
 * and off localhost, so this always resolves to the real one there.
 */
export function useSignupServices(): SignupServices {
  const real = useRealSignupServices();
  const dev = useDevSignupServices();
  return devSignupServicesActive() ? dev : real;
}


