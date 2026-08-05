import { describe, it, expect, beforeEach } from 'vitest';

import {
  isFirstArrivalPending,
  markFirstArrival,
  readFirstArrival,
} from './firstArrival';
import { createInitialGuideState, introState } from './postOnboardingGuide';

const APP = 'ditto';
const NEW_ACCOUNT = 'a'.repeat(64);
const EXISTING_ACCOUNT = 'b'.repeat(64);

/**
 * The signup completion boundary, modelled.
 *
 * `InitialSyncGate.handleSignupComplete` is the only caller of
 * `markFirstArrival`, and it passes the pubkey derived from the key generated
 * during signup — so the marker is armed for the account that was just created
 * and for no other. The settings-only path (an existing user setting up a new
 * device) calls `markComplete` directly and passes no pubkey, so nothing is
 * armed.
 *
 * These tests pin that contract at the boundary rather than through the whole
 * questionnaire, which is a 1300-line component with relay dependencies.
 */
function completeSignup(pubkey: string) {
  markFirstArrival(APP, pubkey);
}

function completeSettingsOnlySetup() {
  // No pubkey handed up, nothing marked. Intentionally a no-op.
}

describe('signup completion boundary', () => {
  beforeEach(() => localStorage.clear());

  it('creates an arrival intent for the account that just signed up', () => {
    completeSignup(NEW_ACCOUNT);
    expect(isFirstArrivalPending(readFirstArrival(APP, NEW_ACCOUNT))).toBe(true);
  });

  it('creates nothing for an existing account finishing device setup', () => {
    completeSettingsOnlySetup();
    expect(readFirstArrival(APP, EXISTING_ACCOUNT)).toBeUndefined();
  });

  it('arms only the signing-up account, never others on the device', () => {
    completeSignup(NEW_ACCOUNT);
    expect(isFirstArrivalPending(readFirstArrival(APP, EXISTING_ACCOUNT))).toBe(false);
  });

  it('publishes nothing — the marker lives entirely in local storage', () => {
    completeSignup(NEW_ACCOUNT);
    const written: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) written.push(key);
    }
    expect(written).toEqual([`ditto:first-arrival:${NEW_ACCOUNT}`]);
  });
});

describe('arrival and mission eligibility are independent', () => {
  beforeEach(() => localStorage.clear());

  it('an existing user is mission-eligible without any arrival', () => {
    // The abandoned signup-onboarding branch inferred "just signed up" from
    // "no mission state". That inference is what coupled the two systems, and
    // it stays broken here: eligibility is decided by MissionEngine from the
    // account alone, and the arrival is decided only by the signup marker.
    const mission = createInitialGuideState(1_000);
    expect(introState(mission)).toBe('pending');
    expect(readFirstArrival(APP, EXISTING_ACCOUNT)).toBeUndefined();
  });

  it('a missing mission state is never evidence of a fresh signup', () => {
    // No mission, no marker → no arrival. The two are unrelated signals.
    expect(isFirstArrivalPending(readFirstArrival(APP, EXISTING_ACCOUNT))).toBe(false);
  });

  it('a fresh signup gets both, in order: arrival first, then the intro', () => {
    completeSignup(NEW_ACCOUNT);
    const mission = createInitialGuideState(Date.now());
    expect(isFirstArrivalPending(readFirstArrival(APP, NEW_ACCOUNT))).toBe(true);
    expect(introState(mission)).toBe('pending');
  });
});
