import { isLocalhostDev } from '@/dev/isLocalhostDev';

/**
 * Localhost-only simulation of the signup → first-arrival handoff.
 *
 * The real arrival broke because signup logs the user in several steps before
 * it finishes: the lifecycle saw the new pubkey, read "no intent", concluded
 * "not owed", and latched that answer permanently. Reproducing that needed a
 * real disposable account, which meant generating a key and publishing a kind 0
 * to public relays — too expensive to repeat, and it leaves real data behind.
 *
 * This drives two things: the fake account the arrival lifecycle sees, and the
 * flag that swaps signup's external effects for the no-network implementation in
 * `signupServices`. The real signup screens and the real arrival are both used
 * unchanged. The ordering that mattered is preserved exactly:
 *
 *   account resolves (save-key step)  →  remaining screens  →  signup completes
 *   →  intent armed
 *
 * It is emphatically **not** a second implementation of the arrival, and not a
 * wrapper around `?missionDev=arrival` — that flag forces an arrival stage
 * directly and bypasses the eligibility path, which is the very thing under
 * test. After the fake completion signal, the real `markFirstArrival`, the real
 * lifecycle, the real destinations and the real FLIP travel all run untouched.
 *
 * Every export returns an inert value when the localhost gate fails, and
 * `import.meta.env.DEV` is statically false in production builds, so the whole
 * module drops out of the bundle.
 */

/**
 * A fixed, obviously-fake pubkey reserved for this tool.
 *
 * Deterministic on purpose: the intent is stored under
 * `ditto:first-arrival:<pubkey>`, so a stable key means Reset can target
 * exactly one record and can never touch a real account's.
 *
 * All-`d` is not a valid public key on the curve, which is a feature — nothing
 * signed by it could ever be accepted by a relay.
 */
export const DEV_SIGNUP_PUBKEY = 'd'.repeat(64);

/** A second fake identity, for the "another account's intent" check. */
export const DEV_SIGNUP_OTHER_PUBKEY = 'e'.repeat(64);

export type DevSignupStage =
  | 'idle'
  | 'account-resolved'
  | 'signup-pending'
  | 'signup-complete'
  | 'arrival-armed'
  | 'navigating';

export interface DevSignupSession {
  /** Whether the fake account should be visible to the application. */
  active: boolean;
  /**
   * Whether signup should use the no-network service implementation.
   *
   * Separate from `active` on purpose: the fake services are installed the
   * moment the interactive signup starts, but the account only becomes
   * available later, at the key step — which is the ordering under test.
   */
  services: boolean;
  stage: DevSignupStage;
  /** ms between the account resolving and signup completing. */
  delayMs: number;
}

/** Things that must never happen during a simulated run. */
export interface DevSignupViolations {
  signerCalls: number;
  relayPublishes: number;
  settingsWrites: number;
  accountChanges: number;
  /** Human-readable details of forbidden attempts, newest last. */
  log: string[];
  /** What the fake services intercepted and did *not* send. Informational. */
  intercepted: string[];
}

const INITIAL_SESSION: DevSignupSession = {
  active: false,
  services: false,
  stage: 'idle',
  delayMs: 5_000,
};

let session: DevSignupSession = { ...INITIAL_SESSION };
let violations: DevSignupViolations = {
  signerCalls: 0,
  relayPublishes: 0,
  settingsWrites: 0,
  accountChanges: 0,
  log: [],
  intercepted: [],
};

const listeners = new Set<() => void>();
/** Timers owned by the current run, cleared on reset so runs cannot stack. */
let timers: ReturnType<typeof setTimeout>[] = [];

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeDevSignup(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readDevSignupSession(): DevSignupSession {
  return session;
}

export function readDevSignupViolations(): DevSignupViolations {
  return violations;
}

/**
 * The pubkey the application should currently believe is logged in, or
 * `undefined` to leave the real account context alone.
 *
 * This is the single point the rest of the app consults. It returns `undefined`
 * off localhost, in production, and whenever no simulation is running — so the
 * real account is never replaced, only shadowed for the duration of a run.
 */
export function devSignupPubkey(): string | undefined {
  if (!isLocalhostDev()) return undefined;
  return session.active ? DEV_SIGNUP_PUBKEY : undefined;
}

/** Whether a simulation is currently shadowing the real account. */
export function devSignupActive(): boolean {
  return devSignupPubkey() !== undefined;
}

function setSession(next: Partial<DevSignupSession>): void {
  session = { ...session, ...next };
  emit();
}

export function setDevSignupDelay(delayMs: number): void {
  setSession({ delayMs });
}

/** Advance the simulation to a stage directly, for the shortcut controls. */
export function setDevSignupStage(stage: DevSignupStage): void {
  setSession({ stage });
}

/** Make the fake account visible without completing signup. */
export function devSignupResolveAccount(): void {
  if (!isLocalhostDev()) return;
  setSession({ active: true, stage: 'signup-pending' });
}

/**
 * Record a forbidden operation. Loud by design: the counters are rendered, and
 * the call sites throw so the attempt cannot pass unnoticed.
 */
export function recordDevSignupViolation(
  kind: keyof Omit<DevSignupViolations, 'log' | 'intercepted'>,
  detail: string,
): void {
  violations = {
    ...violations,
    [kind]: violations[kind] + 1,
    log: [...violations.log.slice(-19), `${kind}: ${detail}`],
  };
  console.error(`[dev-signup-arrival] forbidden operation — ${kind}: ${detail}`);
  emit();
}

export function clearDevSignupTimers(): void {
  for (const timer of timers) clearTimeout(timer);
  timers = [];
}

export function addDevSignupTimer(timer: ReturnType<typeof setTimeout>): void {
  timers.push(timer);
}

/**
 * End the simulation and hand the application back its real account context.
 *
 * Deliberately does not touch the stored intent — clearing that is Reset's job,
 * and the two are separate so "stop shadowing the account" and "let it run
 * again" can be chosen independently.
 */
export function endDevSignupSession(): void {
  clearDevSignupTimers();
  session = { ...INITIAL_SESSION, delayMs: session.delayMs };
  emit();
}

/** Reset the violation counters. Only meaningful between runs. */
export function resetDevSignupViolations(): void {
  violations = {
    signerCalls: 0,
    relayPublishes: 0,
    settingsWrites: 0,
    accountChanges: 0,
    log: [],
    intercepted: [],
  };
  emit();
}

/**
 * Record something the fake services absorbed.
 *
 * Not a violation: the seam worked. This is the developer note about what
 * production *would* have sent, which is the useful half of running the real
 * signup screens with no network behind them.
 */
export function recordDevSignupIntercept(detail: string): void {
  violations = {
    ...violations,
    intercepted: [...violations.intercepted.slice(-19), detail],
  };
  emit();
}

/** Whether signup should use the no-network service implementation. */
export function devSignupServicesActive(): boolean {
  if (!isLocalhostDev()) return false;
  return session.services;
}

/**
 * Begin an interactive fake signup: install the fake services, but do **not**
 * make the account available yet. That happens at the key step, exactly as in
 * production.
 */
export function startDevSignupInteractive(): void {
  if (!isLocalhostDev()) return;
  clearDevSignupTimers();
  resetDevSignupViolations();
  session = { ...INITIAL_SESSION, delayMs: session.delayMs, services: true, stage: 'idle' };
  emit();
}
