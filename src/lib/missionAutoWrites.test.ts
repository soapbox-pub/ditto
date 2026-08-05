import { describe, it, expect, beforeEach } from 'vitest';

import {
  autoWriteStatus,
  claimAutoWrite,
  releaseAutoWrite,
  resetAutoWrites,
  settleAutoWrite,
} from './missionAutoWrites';

const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);

describe('missionAutoWrites', () => {
  beforeEach(resetAutoWrites);

  it('grants a key exactly once per session', () => {
    expect(claimAutoWrite(ALICE, 'markIntroPresented')).toBe(true);
    for (let i = 0; i < 100; i++) {
      expect(claimAutoWrite(ALICE, 'markIntroPresented')).toBe(false);
    }
  });

  it('refuses a retry after a failure, and after a success', () => {
    claimAutoWrite(ALICE, 'initializeGuide');
    settleAutoWrite(ALICE, 'initializeGuide', false);
    expect(claimAutoWrite(ALICE, 'initializeGuide')).toBe(false);
    expect(autoWriteStatus(ALICE, 'initializeGuide')).toBe('failed');

    resetAutoWrites();
    claimAutoWrite(ALICE, 'initializeGuide');
    settleAutoWrite(ALICE, 'initializeGuide', true);
    expect(claimAutoWrite(ALICE, 'initializeGuide')).toBe(false);
  });

  it('scopes claims per account', () => {
    claimAutoWrite(ALICE, 'initializeGuide');
    settleAutoWrite(ALICE, 'initializeGuide', false);
    // Alice's failure says nothing about Bob.
    expect(claimAutoWrite(BOB, 'initializeGuide')).toBe(true);
  });

  it('scopes claims per transition', () => {
    claimAutoWrite(ALICE, 'initializeGuide');
    expect(claimAutoWrite(ALICE, 'markIntroPresented')).toBe(true);
  });

  it('does not let an anonymous claim block a real account', () => {
    // A hook instance can briefly exist before the pubkey resolves. That early
    // claim must not spend the real account's one attempt.
    expect(claimAutoWrite(undefined, 'initializeGuide')).toBe(true);
    settleAutoWrite(undefined, 'initializeGuide', false);
    expect(claimAutoWrite(ALICE, 'initializeGuide')).toBe(true);
  });

  it('returns an unused claim so a genuinely new situation may try', () => {
    // The reducer decided there was nothing to do, so nothing was spent.
    expect(claimAutoWrite(ALICE, 'markIntroPresented')).toBe(true);
    releaseAutoWrite(ALICE, 'markIntroPresented');
    expect(autoWriteStatus(ALICE, 'markIntroPresented')).toBeUndefined();
    expect(claimAutoWrite(ALICE, 'markIntroPresented')).toBe(true);
  });

  it('never blocks the arrival, because it knows nothing about it', () => {
    // The cinematic and the durable mission are separate concerns. This module
    // governs mission writes only; exhausting every claim must leave the
    // arrival's own eligibility untouched.
    claimAutoWrite(ALICE, 'initializeGuide');
    settleAutoWrite(ALICE, 'initializeGuide', false);
    claimAutoWrite(ALICE, 'markIntroPresented');
    settleAutoWrite(ALICE, 'markIntroPresented', false);

    // There is no key by which this module could express "no arrival".
    expect(autoWriteStatus(ALICE, 'initializeGuide')).toBe('failed');
    expect(autoWriteStatus(ALICE, 'markIntroPresented')).toBe('failed');
    expect(Object.keys({ ...autoWriteStatus })).not.toContain('arrival');
  });
});
