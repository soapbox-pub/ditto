import { describe, it, expect, beforeEach } from 'vitest';

import {
  ARRIVAL_SETTLE_MS,
  FIRST_ARRIVAL_TTL_MS,
  clearFirstArrival,
  consumeFirstArrival,
  firstArrivalKey,
  isArrivalSettling,
  isFirstArrivalPending,
  markFirstArrival,
  readFirstArrival,
} from './firstArrival';

const APP = 'ditto';
const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);

describe('first-arrival intent', () => {
  beforeEach(() => localStorage.clear());

  it('is namespaced per app and per account', () => {
    expect(firstArrivalKey(APP, ALICE)).toBe(`ditto:first-arrival:${ALICE}`);
    expect(firstArrivalKey(APP, ALICE)).not.toBe(firstArrivalKey(APP, BOB));
    expect(firstArrivalKey('other', ALICE)).not.toBe(firstArrivalKey(APP, ALICE));
  });

  it('records an intent at signup completion', () => {
    markFirstArrival(APP, ALICE, 1_000);
    expect(readFirstArrival(APP, ALICE)).toEqual({ createdAt: 1_000, consumedAt: undefined });
  });

  it('does not exist for an account that never signed up', () => {
    // Logging into an existing account writes nothing, so there is no marker —
    // this is what keeps the arrival away from ordinary returning sessions.
    expect(readFirstArrival(APP, ALICE)).toBeUndefined();
    expect(isFirstArrivalPending(readFirstArrival(APP, ALICE))).toBe(false);
  });

  it('never leaks one account’s arrival to another', () => {
    markFirstArrival(APP, ALICE, 1_000);
    expect(isFirstArrivalPending(readFirstArrival(APP, ALICE), 1_500)).toBe(true);
    expect(isFirstArrivalPending(readFirstArrival(APP, BOB), 1_500)).toBe(false);
  });

  it('is pending until consumed', () => {
    markFirstArrival(APP, ALICE, 1_000);
    expect(isFirstArrivalPending(readFirstArrival(APP, ALICE), 2_000)).toBe(true);

    consumeFirstArrival(APP, ALICE, 3_000);
    expect(readFirstArrival(APP, ALICE)?.consumedAt).toBe(3_000);
    expect(isFirstArrivalPending(readFirstArrival(APP, ALICE), 4_000)).toBe(false);
  });

  it('keeps the consumed record so a reload cannot replay it', () => {
    // Deleting on consume would make "already played" and "never happened"
    // indistinguishable, and a fresh signup marker could then be re-armed.
    markFirstArrival(APP, ALICE, 1_000);
    consumeFirstArrival(APP, ALICE, 2_000);
    expect(readFirstArrival(APP, ALICE)).toBeDefined();
    expect(isFirstArrivalPending(readFirstArrival(APP, ALICE), 2_100)).toBe(false);
  });

  it('consuming twice keeps the first timestamp', () => {
    markFirstArrival(APP, ALICE, 1_000);
    consumeFirstArrival(APP, ALICE, 2_000);
    consumeFirstArrival(APP, ALICE, 9_000);
    expect(readFirstArrival(APP, ALICE)?.consumedAt).toBe(2_000);
  });

  it('re-marking an unconsumed intent does not extend its life', () => {
    markFirstArrival(APP, ALICE, 1_000);
    markFirstArrival(APP, ALICE, 5_000);
    expect(readFirstArrival(APP, ALICE)?.createdAt).toBe(1_000);
  });

  it('expires once stale', () => {
    markFirstArrival(APP, ALICE, 1_000);
    const justInside = 1_000 + FIRST_ARRIVAL_TTL_MS - 1;
    const atLimit = 1_000 + FIRST_ARRIVAL_TTL_MS;
    expect(isFirstArrivalPending(readFirstArrival(APP, ALICE), justInside)).toBe(true);
    expect(isFirstArrivalPending(readFirstArrival(APP, ALICE), atLimit)).toBe(false);
  });

  it('survives a reload that happens before playback', () => {
    markFirstArrival(APP, ALICE, 1_000);
    // Simulating a reload: nothing in memory, everything re-read from storage.
    const afterReload = readFirstArrival(APP, ALICE);
    expect(isFirstArrivalPending(afterReload, 1_200)).toBe(true);
  });

  describe('malformed markers fail safe', () => {
    it.each([
      ['not json', 'not-json'],
      ['a bare string', '"hello"'],
      ['null', 'null'],
      ['no createdAt', '{}'],
      ['non-numeric createdAt', '{"createdAt":"soon"}'],
      ['NaN createdAt', '{"createdAt":null}'],
      ['non-numeric consumedAt', '{"createdAt":1,"consumedAt":"later"}'],
    ])('treats %s as absent and clears it', (_label, raw) => {
      localStorage.setItem(firstArrivalKey(APP, ALICE), raw);
      expect(readFirstArrival(APP, ALICE)).toBeUndefined();
      // Cleared, so a corrupt value can never wedge the user permanently.
      expect(localStorage.getItem(firstArrivalKey(APP, ALICE))).toBeNull();
    });
  });

  it('can be cleared explicitly', () => {
    markFirstArrival(APP, ALICE, 1_000);
    clearFirstArrival(APP, ALICE);
    expect(readFirstArrival(APP, ALICE)).toBeUndefined();
  });
});

describe('arrival settle window', () => {
  beforeEach(() => localStorage.clear());

  it('is not settling when nothing arrived', () => {
    expect(isArrivalSettling(undefined, 1_000)).toBe(false);
    expect(isArrivalSettling({ createdAt: 1_000 }, 1_000)).toBe(false);
  });

  it('settles for a short beat after the arrival is consumed', () => {
    const intent = { createdAt: 1_000, consumedAt: 2_000 };
    expect(isArrivalSettling(intent, 2_100)).toBe(true);
    expect(isArrivalSettling(intent, 2_000 + ARRIVAL_SETTLE_MS)).toBe(false);
  });
});
