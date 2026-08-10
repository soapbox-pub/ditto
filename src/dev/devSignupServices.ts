import { useMemo } from 'react';

import {
  DEV_SIGNUP_PUBKEY,
  devSignupResolveAccount,
  recordDevSignupIntercept,
} from '@/dev/devSignupArrival';
import type { SignupServices } from '@/lib/signupServices';

/**
 * Localhost dev tool: the same signup screens, none of the effects.
 *
 * Lives here rather than beside the interface so `src/lib` owns only the
 * contract and the production implementation. `src/lib/signupServices.ts` still
 * imports this module to pick between the two, which is the one edge that
 * cannot be removed without threading a flag through the signup components —
 * the thing the seam exists to avoid.
 *
 * What each method does, and why:
 *
 *  - `generateAccount` returns an unmistakably fake key that never decodes,
 *    signs, or gets saved.
 *  - `persistAccount` **must succeed**: making the account active mid-signup is
 *    the behaviour under test, and it is what the arrival handoff depends on.
 *    It does so by flipping the dev session's account shadow, never by touching
 *    the real login store.
 *  - `publishProfile` / `publishFollows` **absorb** the publish and record what
 *    production would have sent. They deliberately do *not* throw: the screens
 *    must behave exactly as they do in production, and a rejection here would
 *    show a "Profile failed" toast that says nothing true about the code under
 *    review. The loud failures live on the signer instead (see `devSignupUser`),
 *    where nothing can be published even by accident.
 *
 * `isPublishingProfile` is constant `false`. The fake publish resolves within
 * the same microtask, so there is no in-flight window to report; introducing an
 * artificial one would make the rehearsal test a delay this tool invented
 * rather than the flow it exists to exercise.
 */
export function useDevSignupServices(): SignupServices {
  return useMemo(
    () => ({
      generateAccount() {
        return {
          // Unmistakably not a key. Never decodes, never signs, never saves.
          secretDisplay: 'nsec1-DEV-FAKE-KEY-NOT-REAL-DO-NOT-USE',
          nsec: undefined,
          pubkey: DEV_SIGNUP_PUBKEY,
        };
      },
      async persistAccount() {
        // The whole point of the simulation: the account becomes available here,
        // several screens before signup completes. Shadows the current user via
        // the dev session; the real account list is never touched.
        devSignupResolveAccount();
        return 'dismissed' as const;
      },
      async publishProfile(content: Record<string, unknown>) {
        recordDevSignupIntercept(
          `kind 0 not sent — fields: ${Object.keys(content).join(', ') || '(none)'}`,
        );
      },
      async publishFollows(event: { content: string; tags: string[][]; prev?: unknown }) {
        recordDevSignupIntercept(
          `kind 3 not sent — ${event.tags.filter((t) => t[0] === 'p').length} follows`,
        );
      },
      isPublishingProfile: false,
    }),
    [],
  );
}
