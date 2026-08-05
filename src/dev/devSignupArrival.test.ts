import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  DEV_SIGNUP_OTHER_PUBKEY,
  DEV_SIGNUP_PUBKEY,
  addDevSignupTimer,
  clearDevSignupTimers,
  devSignupActive,
  devSignupPubkey,
  devSignupResolveAccount,
  devSignupServicesActive,
  endDevSignupSession,
  readDevSignupSession,
  readDevSignupViolations,
  recordDevSignupViolation,
  recordDevSignupIntercept,
  resetDevSignupViolations,
  setDevSignupDelay,
  startDevSignupInteractive,
  subscribeDevSignup,
} from './devSignupArrival';
import { createDevSignupUser } from './devSignupUser';
import {
  clearFirstArrival,
  isFirstArrivalPending,
  markFirstArrival,
  readFirstArrival,
} from '@/lib/firstArrival';

const APP = 'ditto';
const REAL = 'a'.repeat(64);

describe('devSignupArrival — localhost gate', () => {
  beforeEach(() => {
    endDevSignupSession();
    resetDevSignupViolations();
  });

  it('shadows nothing until a simulation starts', () => {
    expect(devSignupPubkey()).toBeUndefined();
    expect(devSignupActive()).toBe(false);
  });

  it('shadows the account only while the simulation runs', () => {
    devSignupResolveAccount();
    expect(devSignupPubkey()).toBe(DEV_SIGNUP_PUBKEY);
    expect(devSignupActive()).toBe(true);

    // Leaving restores the real account context completely.
    endDevSignupSession();
    expect(devSignupPubkey()).toBeUndefined();
    expect(readDevSignupSession().stage).toBe('idle');
  });

  it('is inert when the localhost gate fails', async () => {
    vi.resetModules();
    vi.doMock('@/dev/isLocalhostDev', () => ({ isLocalhostDev: () => false }));
    const mod = await import('./devSignupArrival');
    mod.devSignupResolveAccount();
    expect(mod.devSignupPubkey()).toBeUndefined();
    expect(mod.devSignupActive()).toBe(false);
    vi.doUnmock('@/dev/isLocalhostDev');
    vi.resetModules();
  });
});

describe('devSignupArrival — the ordering under test', () => {
  beforeEach(() => {
    endDevSignupSession();
    resetDevSignupViolations();
    localStorage.clear();
  });

  it('resolves the account before any intent exists', () => {
    // This is the production ordering that broke: a resolved pubkey with no
    // marker. Collapsing it (arming first) would test nothing.
    devSignupResolveAccount();
    expect(devSignupPubkey()).toBe(DEV_SIGNUP_PUBKEY);
    expect(readFirstArrival(APP, DEV_SIGNUP_PUBKEY)).toBeUndefined();
    expect(readDevSignupSession().stage).toBe('signup-pending');
  });

  it('arms the real intent, in the real format, at completion', () => {
    devSignupResolveAccount();
    markFirstArrival(APP, DEV_SIGNUP_PUBKEY);

    const intent = readFirstArrival(APP, DEV_SIGNUP_PUBKEY);
    expect(intent?.createdAt).toBeGreaterThan(0);
    expect(isFirstArrivalPending(intent)).toBe(true);
    // No bespoke fake format — the same record the real lifecycle consumes.
    expect(Object.keys(intent!).sort()).toEqual(['consumedAt', 'createdAt']);
  });

  it('defaults to a delay that outlives the account-wait timeout', () => {
    // 5s is not decorative: ACCOUNT_WAIT_MS is 5s, and the original bug needed
    // completion to land after it.
    expect(readDevSignupSession().delayMs).toBe(5_000);
    setDevSignupDelay(10_000);
    expect(readDevSignupSession().delayMs).toBe(10_000);
    setDevSignupDelay(5_000);
  });

  it('keeps the fake identity distinct from the mismatch identity', () => {
    expect(DEV_SIGNUP_PUBKEY).not.toBe(DEV_SIGNUP_OTHER_PUBKEY);
    markFirstArrival(APP, DEV_SIGNUP_OTHER_PUBKEY);
    // Arming the other identity leaves the tool's own account with nothing.
    expect(readFirstArrival(APP, DEV_SIGNUP_PUBKEY)).toBeUndefined();
  });
});

describe('devSignupArrival — reset is narrow', () => {
  beforeEach(() => {
    endDevSignupSession();
    localStorage.clear();
  });

  it('clears only the fake account’s marker', () => {
    markFirstArrival(APP, REAL);
    markFirstArrival(APP, DEV_SIGNUP_PUBKEY);
    localStorage.setItem('ditto:unrelated', 'keep me');
    localStorage.setItem('ditto:settings-lastSync:' + REAL, '123');

    clearFirstArrival(APP, DEV_SIGNUP_PUBKEY);

    expect(readFirstArrival(APP, DEV_SIGNUP_PUBKEY)).toBeUndefined();
    expect(readFirstArrival(APP, REAL)).toBeDefined();
    expect(localStorage.getItem('ditto:unrelated')).toBe('keep me');
    expect(localStorage.getItem('ditto:settings-lastSync:' + REAL)).toBe('123');
  });

  it('cancels the previous run’s timers so repeated runs cannot stack', () => {
    // Each run registers its timers with the module. Starting another run (or
    // resetting) must cancel them, or a second click would schedule a second
    // completion and a second navigation on top of the first.
    vi.useFakeTimers();
    try {
      const fired: string[] = [];
      for (const run of ['a', 'b', 'c']) {
        clearDevSignupTimers(); // what runFullSignup does first
        addDevSignupTimer(setTimeout(() => fired.push(run), 1_000));
      }
      vi.advanceTimersByTime(5_000);
      // Only the last run's timer survived.
      expect(fired).toEqual(['c']);

      // And ending the session cancels even that one.
      fired.length = 0;
      addDevSignupTimer(setTimeout(() => fired.push('d'), 1_000));
      endDevSignupSession();
      vi.advanceTimersByTime(5_000);
      expect(fired).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('devSignupUser — nothing can be signed or published', () => {
  beforeEach(resetDevSignupViolations);

  it('exposes the fake pubkey without a signer capability', () => {
    const user = createDevSignupUser();
    expect(user.pubkey).toBe(DEV_SIGNUP_PUBKEY);
    // No nip44 means `hasNip44Support` is false, which makes MissionEngine skip
    // initialization — the reason a run reaches zero settings writes rather
    // than "writes that fail".
    expect(user.signer.nip44).toBeUndefined();
    expect(user.signer.nip04).toBeUndefined();
  });

  it('throws and counts when anything tries to sign', () => {
    const user = createDevSignupUser();
    expect(() => user.signer.signEvent({})).toThrow(/not available in the simulation/);
    expect(readDevSignupViolations().signerCalls).toBe(1);
  });

  it('records forbidden operations loudly rather than swallowing them', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    recordDevSignupViolation('settingsWrites', 'updateSettings(theme)');
    expect(readDevSignupViolations().settingsWrites).toBe(1);
    expect(readDevSignupViolations().log.at(-1)).toContain('updateSettings(theme)');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('notifies subscribers so the readout cannot go stale', () => {
    let notified = 0;
    const unsubscribe = subscribeDevSignup(() => notified++);
    devSignupResolveAccount();
    expect(notified).toBeGreaterThan(0);
    unsubscribe();
  });
});

describe('devSignupArrival — interactive full signup', () => {
  beforeEach(() => {
    endDevSignupSession();
    resetDevSignupViolations();
    localStorage.clear();
  });

  it('installs the fake services without making the account available yet', () => {
    // The distinction that makes this a real rehearsal: signup starts at its
    // first screen with no account, exactly as production does. If the account
    // appeared here, the ordering the arrival depends on would be untested.
    startDevSignupInteractive();
    expect(devSignupServicesActive()).toBe(true);
    expect(devSignupPubkey()).toBeUndefined();
    expect(devSignupActive()).toBe(false);
    expect(readDevSignupSession().stage).toBe('idle');
  });

  it('creates no arrival intent until the final action', () => {
    startDevSignupInteractive();
    // The key step makes the account available, three screens early.
    devSignupResolveAccount();
    expect(devSignupPubkey()).toBe(DEV_SIGNUP_PUBKEY);
    // Still nothing armed: intermediate steps must not arm it.
    expect(readFirstArrival(APP, DEV_SIGNUP_PUBKEY)).toBeUndefined();

    // Only the real completion action does.
    markFirstArrival(APP, DEV_SIGNUP_PUBKEY);
    expect(isFirstArrivalPending(readFirstArrival(APP, DEV_SIGNUP_PUBKEY))).toBe(true);
  });

  it('is not active until the run is started', () => {
    expect(devSignupServicesActive()).toBe(false);
  });

  it('starts a second run from a clean slate', () => {
    startDevSignupInteractive();
    devSignupResolveAccount();
    markFirstArrival(APP, DEV_SIGNUP_PUBKEY);
    recordDevSignupViolation('signerCalls', 'first run');

    startDevSignupInteractive();
    expect(devSignupPubkey()).toBeUndefined();
    expect(readDevSignupViolations().signerCalls).toBe(0);
    expect(readDevSignupViolations().intercepted).toEqual([]);
  });

  it('records what the fake services absorbed rather than counting it as a violation', () => {
    startDevSignupInteractive();
    recordDevSignupIntercept('kind 0 not sent — fields: name');
    expect(readDevSignupViolations().intercepted).toEqual(['kind 0 not sent — fields: name']);
    // The seam worked, so nothing is a violation.
    expect(readDevSignupViolations().relayPublishes).toBe(0);
    expect(readDevSignupViolations().signerCalls).toBe(0);
  });
});
