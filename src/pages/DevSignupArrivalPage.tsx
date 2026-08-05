import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNostrLogin } from '@nostrify/react/login';

import { isLocalhostDev } from '@/dev/isLocalhostDev';
import {
  DEV_SIGNUP_OTHER_PUBKEY,
  DEV_SIGNUP_PUBKEY,
  type DevSignupStage,
  addDevSignupTimer,
  clearDevSignupTimers,
  devSignupResolveAccount,
  endDevSignupSession,
  readDevSignupSession,
  readDevSignupViolations,
  recordDevSignupViolation,
  resetDevSignupViolations,
  setDevSignupDelay,
  setDevSignupStage,
  startDevSignupInteractive,
  subscribeDevSignup,
} from '@/dev/devSignupArrival';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useAppContext } from '@/hooks/useAppContext';
import {
  clearFirstArrival,
  firstArrivalVersion,
  isFirstArrivalPending,
  markFirstArrival,
  readFirstArrival,
  subscribeFirstArrival,
} from '@/lib/firstArrival';

const DELAYS = [
  { label: 'Immediate', ms: 0 },
  { label: '2 seconds', ms: 2_000 },
  { label: '5 seconds', ms: 5_000 },
  { label: '10 seconds', ms: 10_000 },
];

const STAGES: DevSignupStage[] = [
  'idle',
  'account-resolved',
  'signup-pending',
  'signup-complete',
  'arrival-armed',
  'navigating',
];

/**
 * Localhost-only tool for exercising the signup → first-arrival handoff without
 * creating an account or touching Nostr.
 *
 * The bug this exists to catch was a **timing** bug: signup logs the user in
 * several steps before it finishes, so the arrival lifecycle saw the new pubkey,
 * found no intent, and latched "not owed" permanently. Reproducing it needed a
 * real disposable account — a generated key and a published kind 0 — which is
 * far too expensive to run on every change and leaves public data behind.
 *
 * So this page fakes only the *effects*. Two modes:
 *
 *  - **Interactive full signup** (primary) — launches the real production signup
 *    UI at its first screen via the ordinary `startSignup()`. Every screen, step
 *    order, transition, validation rule and button is the production one; only
 *    `SignupServices` is swapped, so no key is generated, no account is added,
 *    and no kind 0 or kind 3 is published. The account becomes available at the
 *    save-key step, three screens before completion, and the arrival intent is
 *    armed only by the real final action.
 *  - **Handoff-only simulator** (secondary) — skips the screens and reproduces
 *    just the account/intent race, with an adjustable delay. The 5s default
 *    outlives `ACCOUNT_WAIT_MS`, which is what the original bug needed.
 *
 * Everything after the completion signal is the real implementation —
 * `markFirstArrival`, `useFirstArrivalExperience`, the real destinations, the
 * real FLIP travel, the real Skip. Neither the signup UI nor the arrival is
 * re-implemented here, and this is **not** `?missionDev=arrival`: that flag
 * forces an arrival stage and skips eligibility, which is the part under test.
 *
 * The run navigates to `/?missionDev=intro`. That supplies a mission state so
 * the real sidebar widget and mobile teaser exist to travel to (the harness
 * substitutes state for reading and swallows writes), while leaving arrival
 * eligibility entirely to the real path — `intro` is not an `arrival*` scenario,
 * so nothing is forced.
 */
export function DevSignupArrivalPage() {
  const navigate = useNavigate();
  const { config } = useAppContext();
  const { logins } = useNostrLogin();
  const { startSignup } = useOnboarding();

  const session = useSyncExternalStore(subscribeDevSignup, readDevSignupSession);
  const violations = useSyncExternalStore(subscribeDevSignup, readDevSignupViolations);
  useSyncExternalStore(subscribeFirstArrival, firstArrivalVersion);

  const [note, setNote] = useState<string | null>(null);
  const [baselineLogins] = useState(() => logins.map((l) => l.id).join(','));

  // Watching the real account list is the only honest way to report "real
  // accounts changed": the simulation shadows the current user rather than
  // mutating this, so any change here would be a genuine leak.
  const currentLogins = logins.map((l) => l.id).join(',');
  useEffect(() => {
    if (currentLogins !== baselineLogins) {
      recordDevSignupViolation(
        'accountChanges',
        `login list changed: ${baselineLogins || '(none)'} -> ${currentLogins || '(none)'}`,
      );
    }
  }, [currentLogins, baselineLogins]);

  // Timers belong to the module store, not to this component, so returning to
  // the page mid-run does not strand them — and leaving never leaves the app
  // shadowed by a fake account.
  useEffect(() => clearDevSignupTimers, []);

  const intent = readFirstArrival(config.appId, DEV_SIGNUP_PUBKEY);
  const pending = isFirstArrivalPending(intent);

  const complete = useCallback(() => {
    setDevSignupStage('signup-complete');
    // The real intent, in the real format, under the real key.
    markFirstArrival(config.appId, DEV_SIGNUP_PUBKEY);
    setDevSignupStage('arrival-armed');
    const t = setTimeout(() => {
      setDevSignupStage('navigating');
      // `missionDev=intro` supplies a mission state so the real destinations
      // exist. It is not an arrival scenario, so eligibility is untouched.
      navigate('/?missionDev=intro');
    }, 350);
    addDevSignupTimer(t);
  }, [config.appId, navigate]);

  /**
   * The primary control: run the **real** signup UI with fake services.
   *
   * Installs the no-network implementation and then hands over to the ordinary
   * `startSignup()` — the same entry point the landing page uses — so every
   * screen, transition, validation rule and button is the production one. The
   * account becomes available at the key step and the arrival intent is armed
   * only by the real final action, exactly as in production.
   */
  const runInteractiveSignup = useCallback(() => {
    clearFirstArrival(config.appId, DEV_SIGNUP_PUBKEY);
    startDevSignupInteractive();
    setNote(null);
    startSignup();
  }, [config.appId, startSignup]);

  const runHandoffSimulation = useCallback(() => {
    clearDevSignupTimers();
    resetDevSignupViolations();
    setNote(null);
    // 1. The account resolves first. This is the ordering that broke production.
    devSignupResolveAccount();
    setDevSignupStage('account-resolved');
    const t1 = setTimeout(() => setDevSignupStage('signup-pending'), 200);
    addDevSignupTimer(t1);
    // 2. Signup completes later, and only then is the intent armed.
    const t2 = setTimeout(complete, Math.max(session.delayMs, 250));
    addDevSignupTimer(t2);
  }, [complete, session.delayMs]);

  const reset = useCallback(() => {
    clearDevSignupTimers();
    // Only this fake account's marker. Never real accounts, mission state,
    // encrypted settings, or any other key.
    clearFirstArrival(config.appId, DEV_SIGNUP_PUBKEY);
    endDevSignupSession();
    resetDevSignupViolations();
    setNote('Reset: cleared only ditto:first-arrival:' + DEV_SIGNUP_PUBKEY.slice(0, 8) + '…');
  }, [config.appId]);

  const armOtherAccount = useCallback(() => {
    markFirstArrival(config.appId, DEV_SIGNUP_OTHER_PUBKEY);
    setNote('Armed an intent for a different fake pubkey. Running now must NOT play.');
  }, [config.appId]);

  if (!isLocalhostDev()) return null;

  const row = 'flex items-center justify-between gap-4 py-1 border-b border-dashed border-muted';

  return (
    <div className="mx-auto max-w-3xl p-6 font-mono text-sm">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-600">
          Developer tool · localhost only
        </p>
        <h1 className="text-xl font-bold">Signup → arrival handoff</h1>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
          Runs the <b>real production signup UI</b> — the same screens, step order,
          copy, validation and transitions — with its external effects swapped for a
          no-network implementation, and then hands over to the real arrival. No keys,
          no signer, no publishes, no settings writes, no account created. This is not{' '}
          <code>?missionDev=arrival</code>: eligibility runs for real. See the caveat
          under Safety about read-only subscriptions.
        </p>
      </header>

      <section className="mb-6">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wider">
          Interactive full signup
        </h2>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Launches the real signup UI at its first screen. Click through it yourself:
          theme → key → save key → profile → follow packs → “Let’s go”. The account
          becomes available at the save-key step; the arrival intent is armed only by
          the final action.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runInteractiveSignup}
            className="rounded bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
          >
            Run full fake signup
          </button>
          <button type="button" onClick={reset} className="rounded border px-3 py-1.5 text-xs">
            Reset
          </button>
          <button
            type="button"
            onClick={() => {
              resetDevSignupViolations();
              devSignupResolveAccount();
              setDevSignupStage('signup-pending');
            }}
            className="rounded border px-3 py-1.5 text-xs"
          >
            Account resolved, signup pending
          </button>
          <button type="button" onClick={complete} className="rounded border px-3 py-1.5 text-xs">
            Trigger completion now
          </button>
          <button
            type="button"
            onClick={() => {
              clearFirstArrival(config.appId, DEV_SIGNUP_PUBKEY);
              runInteractiveSignup();
            }}
            className="rounded border px-3 py-1.5 text-xs"
          >
            Replay arrival
          </button>
          <button type="button" onClick={armOtherAccount} className="rounded border px-3 py-1.5 text-xs">
            Arm other pubkey
          </button>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wider">
          Handoff-only simulator
        </h2>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Skips the signup screens entirely and reproduces just the account/intent
          race. Useful for the timing question on its own; it is <b>not</b> the full
          signup.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runHandoffSimulation}
            className="rounded border border-primary px-3 py-1.5 text-xs font-bold"
          >
            Run handoff simulation
          </button>
        </div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Delay between account resolution and signup completion
        </h3>
        <div className="flex flex-wrap gap-2">
          {DELAYS.map((d) => (
            <button
              key={d.ms}
              type="button"
              onClick={() => setDevSignupDelay(d.ms)}
              className={`rounded border px-3 py-1.5 text-xs ${
                session.delayMs === d.ms ? 'border-primary bg-primary/10 font-bold' : ''
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          5s is the default because it outlives ACCOUNT_WAIT_MS, which is what the
          production bug needed.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider">State</h2>
        <div className={row}>
          <span>fake pubkey</span>
          <code className="text-xs">{DEV_SIGNUP_PUBKEY.slice(0, 16)}…</code>
        </div>
        <div className={row}>
          <span>account shadowing active</span>
          <b data-dev-active>{String(session.active)}</b>
        </div>
        <div className={row}>
          <span>stage</span>
          <b data-dev-stage>{session.stage}</b>
        </div>
        <div className={row}>
          <span>stage order</span>
          <span className="text-[11px] text-muted-foreground">
            {STAGES.map((s) => (s === session.stage ? `[${s}]` : s)).join(' → ')}
          </span>
        </div>
        <div className={row}>
          <span>intent exists</span>
          <b data-dev-intent>{String(!!intent)}</b>
        </div>
        <div className={row}>
          <span>intent pending</span>
          <b>{String(pending)}</b>
        </div>
        <div className={row}>
          <span>consumedAt</span>
          <b data-dev-consumed>{intent?.consumedAt ? new Date(intent.consumedAt).toISOString() : '—'}</b>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider">Safety</h2>
        <div className={row}>
          <span>Real signer calls</span>
          <b data-dev-signer className={violations.signerCalls ? 'text-red-600' : ''}>
            {violations.signerCalls}
          </b>
        </div>
        <div className={row}>
          <span>Relay publishes</span>
          <b data-dev-publishes className={violations.relayPublishes ? 'text-red-600' : ''}>
            {violations.relayPublishes}
          </b>
        </div>
        <div className={row}>
          <span>Encrypted settings writes</span>
          <b data-dev-settings className={violations.settingsWrites ? 'text-red-600' : ''}>
            {violations.settingsWrites}
          </b>
        </div>
        <div className={row}>
          <span>Real accounts changed</span>
          <b data-dev-accounts className={violations.accountChanges ? 'text-red-600' : ''}>
            {violations.accountChanges}
          </b>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Publishing requires signing, and the fake signer throws on{' '}
          <code>signEvent</code>, so the publish count is derived from the signer
          count rather than measured at the socket. Settings writes are blocked and
          counted inside the mutation itself. Account changes are observed by
          watching the real login list.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-500">
          Honest caveat: the app still opens its ordinary <b>read-only</b>{' '}
          subscriptions for whatever pubkey is logged in — profile, notifications,
          follow lists, settings. Roughly 22 REQ frames per run mention the fake
          key. They are reads, never writes, and the key is not a valid curve
          point so they match nothing and reveal nothing. Silencing them would
          mean changing production hooks, which this tool must not do. The
          guarantee here is <b>zero writes and zero publishes</b>, not zero
          network traffic.
        </p>
        {violations.log.length > 0 && (
          <ul className="mt-2 space-y-1 text-[11px] text-red-600">
            {violations.log.map((entry, i) => (
              <li key={i}>{entry}</li>
            ))}
          </ul>
        )}
      </section>

      {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}
