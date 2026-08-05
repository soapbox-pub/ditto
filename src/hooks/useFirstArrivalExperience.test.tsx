import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useFirstArrivalExperience } from './useFirstArrivalExperience';
import {
  isFirstArrivalPending,
  markFirstArrival,
  readFirstArrival,
} from '@/lib/firstArrival';

const APP = 'ditto';
const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);

let pubkey: string | undefined = ALICE;
let reduced = false;

vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ config: { appId: APP } }),
}));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: pubkey ? { pubkey } : null }),
}));
vi.mock('@/lib/reducedMotion', () => ({
  prefersReducedMotion: () => reduced,
}));

/**
 * Run the whole sequence to completion.
 *
 * Two steps on purpose: the `revealing → done` timer is only scheduled once
 * React has re-rendered with `phase === 'revealing'`, so a single bulk advance
 * would fire the first timer and never register the second.
 */
function playThrough() {
  act(() => void vi.advanceTimersByTime(3_000)); // playing → revealing
  act(() => void vi.advanceTimersByTime(1_000)); // revealing → done
}

describe('useFirstArrivalExperience', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    pubkey = ALICE;
    reduced = false;
  });
  afterEach(() => vi.useRealTimers());

  it('plays once for an account that just signed up', () => {
    markFirstArrival(APP, ALICE);
    const { result } = renderHook(() => useFirstArrivalExperience());

    expect(result.current.phase).toBe('playing');
    expect(result.current.visible).toBe(true);

    playThrough();
    expect(result.current.phase).toBe('done');
    expect(result.current.visible).toBe(false);
  });

  it('never plays for an ordinary returning session', () => {
    // No marker: logging into an existing account writes nothing.
    const { result } = renderHook(() => useFirstArrivalExperience());
    expect(result.current.phase).toBe('idle');
    expect(result.current.visible).toBe(false);
  });

  it('does not replay after completing', () => {
    markFirstArrival(APP, ALICE);
    const first = renderHook(() => useFirstArrivalExperience());
    playThrough();
    first.unmount();

    const second = renderHook(() => useFirstArrivalExperience());
    expect(second.result.current.phase).toBe('idle');
  });

  it('does not replay after skipping', () => {
    markFirstArrival(APP, ALICE);
    const first = renderHook(() => useFirstArrivalExperience());
    act(() => first.result.current.skip());
    expect(first.result.current.phase).toBe('revealing');
    act(() => void vi.advanceTimersByTime(1_000));
    expect(first.result.current.phase).toBe('done');
    first.unmount();

    const second = renderHook(() => useFirstArrivalExperience());
    expect(second.result.current.phase).toBe('idle');
  });

  it('skipping consumes the intent immediately', () => {
    markFirstArrival(APP, ALICE);
    const { result } = renderHook(() => useFirstArrivalExperience());
    act(() => result.current.skip());
    expect(readFirstArrival(APP, ALICE)?.consumedAt).toBeTypeOf('number');
  });

  it('does not consume the intent before the experience is presented', () => {
    // A reload one second into the sequence must not silently eat the moment.
    markFirstArrival(APP, ALICE);
    const { result, unmount } = renderHook(() => useFirstArrivalExperience());
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current.phase).toBe('playing');
    expect(isFirstArrivalPending(readFirstArrival(APP, ALICE))).toBe(true);

    unmount();
    const afterReload = renderHook(() => useFirstArrivalExperience());
    expect(afterReload.result.current.phase).toBe('playing');
  });

  it('waits for a delayed account, then still presents exactly once', () => {
    markFirstArrival(APP, ALICE);
    pubkey = undefined;
    const { result, rerender } = renderHook(() => useFirstArrivalExperience());
    expect(result.current.phase).toBe('waiting');

    pubkey = ALICE;
    rerender();
    expect(result.current.phase).toBe('playing');

    playThrough();
    expect(result.current.phase).toBe('done');
  });

  it('gives up waiting for an account after a bounded interval', () => {
    pubkey = undefined;
    const { result } = renderHook(() => useFirstArrivalExperience());
    expect(result.current.phase).toBe('waiting');

    act(() => void vi.advanceTimersByTime(5_000));
    expect(result.current.phase).toBe('idle');
  });

  it('does not replay one account’s arrival when switching to another', () => {
    markFirstArrival(APP, ALICE);
    const { result, rerender } = renderHook(() => useFirstArrivalExperience());
    playThrough();
    expect(result.current.phase).toBe('done');

    // Switch to an older existing account: no marker, so nothing plays.
    pubkey = BOB;
    rerender();
    expect(result.current.phase).toBe('idle');
  });

  it('plays for a second account that genuinely signed up', () => {
    markFirstArrival(APP, ALICE);
    const { result, rerender } = renderHook(() => useFirstArrivalExperience());
    playThrough();

    markFirstArrival(APP, BOB);
    pubkey = BOB;
    rerender();
    expect(result.current.phase).toBe('playing');
  });

  it('ignores a stale marker', () => {
    markFirstArrival(APP, ALICE, Date.now() - 60 * 60_000);
    const { result } = renderHook(() => useFirstArrivalExperience());
    expect(result.current.phase).toBe('idle');
  });

  it('ignores a malformed marker rather than throwing', () => {
    localStorage.setItem(`ditto:first-arrival:${ALICE}`, '{{{');
    const { result } = renderHook(() => useFirstArrivalExperience());
    expect(result.current.phase).toBe('idle');
  });

  it('follows the same lifecycle under reduced motion, just faster', () => {
    reduced = true;
    markFirstArrival(APP, ALICE);
    const { result } = renderHook(() => useFirstArrivalExperience());

    expect(result.current.phase).toBe('playing');
    expect(result.current.reducedMotion).toBe(true);

    act(() => void vi.advanceTimersByTime(1_500));
    expect(result.current.phase).toBe('revealing');
    act(() => void vi.advanceTimersByTime(200));
    expect(result.current.phase).toBe('done');
    // Same end state, same consumption — only the pacing differs.
    expect(readFirstArrival(APP, ALICE)?.consumedAt).toBeTypeOf('number');
  });

  it('publishes nothing — the arrival is recorded purely locally', () => {
    // The whole sequence must leave exactly one artefact: a localStorage marker.
    // If a future change reaches for `useNostrPublish` (or writes NIP-78
    // settings) to record animation state, this fails.
    markFirstArrival(APP, ALICE);
    renderHook(() => useFirstArrivalExperience());
    playThrough();

    const written: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) written.push(key);
    }
    expect(written).toEqual([`ditto:first-arrival:${ALICE}`]);
  });

  it('ignores a skip once the sequence has already handed over', () => {
    markFirstArrival(APP, ALICE);
    const { result } = renderHook(() => useFirstArrivalExperience());
    playThrough();
    act(() => result.current.skip());
    expect(result.current.phase).toBe('done');
  });
});
