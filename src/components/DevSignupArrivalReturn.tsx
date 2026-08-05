import { useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';

import { isLocalhostDev } from '@/dev/isLocalhostDev';
import { readDevSignupSession, subscribeDevSignup } from '@/dev/devSignupArrival';

/**
 * A small way back to the signup→arrival dev tool once a simulated run has
 * navigated to `/`.
 *
 * Shown only while a simulation is actually shadowing the account, so it cannot
 * appear during ordinary localhost development, and never in production —
 * `isLocalhostDev()` is statically false there and this returns null.
 *
 * Sits below the arrival overlay's z-index on purpose: it must not cover the
 * thing being inspected.
 */
export function DevSignupArrivalReturn() {
  const session = useSyncExternalStore(subscribeDevSignup, readDevSignupSession);
  if (!isLocalhostDev()) return null;
  if (!session.active) return null;

  return (
    <Link
      to="/dev/signup-arrival"
      data-dev-return
      className="fixed bottom-3 left-3 z-[90] rounded-full border border-amber-500/60 bg-amber-500/10 px-3 py-1.5 font-mono text-[11px] font-bold text-amber-700 backdrop-blur hover:bg-amber-500/20 dark:text-amber-400"
    >
      ← dev: signup-arrival
    </Link>
  );
}
