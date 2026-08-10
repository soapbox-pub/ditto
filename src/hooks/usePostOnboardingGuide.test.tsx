import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSyncExternalStore } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';

import { usePostOnboardingGuide } from './usePostOnboardingGuide';
import { resetAutoWrites } from '@/lib/missionAutoWrites';
import {
  createInitialGuideState,
  type PostOnboardingGuideState,
} from '@/lib/postOnboardingGuide';
import type { EncryptedSettings } from './useEncryptedSettings';

/**
 * A stand-in for the NIP-78 encrypted settings store, with the property that
 * actually matters here: `mutateAsync` takes a *partial* patch and shallow
 * merges it, so a write to `postOnboardingGuide` can never disturb any other
 * setting. Tests drive it directly to simulate reloads and failed writes.
 */
let settings: EncryptedSettings | undefined;
let isLoading = false;
let writeCount = 0;
let failNextWrite = false;

// Subscribers so consumers re-render on a write, the way the real
// query-cache-backed hook does.
const listeners = new Set<() => void>();
function emit() {
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const mutateAsync = vi.fn(async (patch: Partial<EncryptedSettings>) => {
  writeCount += 1;
  if (failNextWrite) {
    failNextWrite = false;
    throw new Error('publish failed');
  }
  settings = { ...settings, ...patch };
  emit();
  return { updatedSettings: settings };
});

/**
 * The localhost harness, controllable from tests. When it owns the state the
 * hook must never touch the real persistence path at all.
 */
let devState: PostOnboardingGuideState | undefined;
const devListeners = new Set<() => void>();
vi.mock('@/dev/missionHarness', () => ({
  readMissionDevState: () => devState,
  subscribeMissionDev: (listener: () => void) => {
    devListeners.add(listener);
    return () => devListeners.delete(listener);
  },
  writeMissionDevState: (next: PostOnboardingGuideState) => {
    devState = next;
    for (const l of devListeners) l();
  },
  missionDevRejectsWrites: () => false,
}));

/**
 * The active account, and every other account's settings.
 *
 * The real `useEncryptedSettings` query is keyed by pubkey, so switching
 * accounts swaps the whole settings object out — and reports `undefined` for an
 * account that has none. {@link switchAccount} reproduces exactly that.
 */
let pubkey: string | undefined;
const accounts = new Map<string, EncryptedSettings | undefined>();

vi.mock('./useEncryptedSettings', () => ({
  useEncryptedSettings: () => ({
    settings: useSyncExternalStore(subscribe, () => settings),
    isLoading,
    updateSettings: { mutateAsync, isPending: false },
    hasNip44Support: true,
    pubkey,
  }),
}));

/** Make a different account active, exactly as a login switch would. */
function switchAccount(next: string | undefined) {
  if (pubkey !== undefined) accounts.set(pubkey, settings);
  pubkey = next;
  settings = next === undefined ? undefined : accounts.get(next);
  emit();
}

function reset() {
  resetAutoWrites();
  devState = undefined;
  devListeners.clear();
  settings = undefined;
  isLoading = false;
  writeCount = 0;
  failNextWrite = false;
  listeners.clear();
  accounts.clear();
  pubkey = undefined;
  mutateAsync.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
}

/** The mission state currently in the fake store. */
function stored(): PostOnboardingGuideState | undefined {
  return settings?.postOnboardingGuide;
}

/** Seed the store with a mission state, as if loaded from relays. */
function seed(state: Partial<PostOnboardingGuideState> = {}) {
  settings = {
    theme: 'dark',
    postOnboardingGuide: { ...createInitialGuideState(1_000), ...state },
  } as EncryptedSettings;
}

const ALL_TASKS = ['find-people', 'post-small', 'customize', 'interact'] as const;

describe('usePostOnboardingGuide — initialization', () => {
  beforeEach(reset);

  it('creates a mission for an authenticated user with no prior state', async () => {
    const { result } = renderHook(() => usePostOnboardingGuide());
    expect(result.current.state).toBeUndefined();

    await act(async () => {
      await result.current.initializeGuide();
    });

    expect(stored()?.status).toBe('active');
    expect(writeCount).toBe(1);
  });

  it('never depends on how the account was created', async () => {
    // There is no signup flag, source, or intent to pass — initialization takes
    // no arguments at all, so no caller can couple it to a signup flow.
    expect(usePostOnboardingGuide).toBeTypeOf('function');
    const { result } = renderHook(() => usePostOnboardingGuide());
    await act(async () => {
      await result.current.initializeGuide();
    });
    expect(stored()).not.toHaveProperty('source');
  });

  it('is idempotent — a second initialize never overwrites progress', async () => {
    seed({ paths: { 'find-people': 'completed', 'post-small': 'not_started', customize: 'not_started', interact: 'not_started' } });
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.initializeGuide();
      await result.current.initializeGuide();
    });

    expect(writeCount).toBe(0);
    expect(stored()?.paths['find-people']).toBe('completed');
  });

  it('never resurrects a dismissed mission', async () => {
    seed({ status: 'skipped', skippedAt: 2_000 });
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.initializeGuide();
    });

    expect(stored()?.status).toBe('skipped');
    expect(writeCount).toBe(0);
  });

  it('leaves other settings untouched', async () => {
    settings = { theme: 'dark', autoplayVideos: true } as EncryptedSettings;
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.initializeGuide();
    });

    expect(settings?.theme).toBe('dark');
    expect(settings?.autoplayVideos).toBe(true);
    expect(stored()?.status).toBe('active');
  });

  it('does not re-initialize on its own after the write fails', async () => {
    // Initialization is automatic, so "retry until it works" means "retry on
    // every render". That is the loop this guards against: one attempt per
    // account per session, picked up again on the next load.
    failNextWrite = true;
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.initializeGuide();
    });
    // No corrupt local state left behind, and nothing persisted.
    expect(stored()).toBeUndefined();
    expect(result.current.state).toBeUndefined();
    expect(writeCount).toBe(1);

    await act(async () => {
      await result.current.initializeGuide();
      await result.current.initializeGuide();
    });
    expect(writeCount).toBe(1);
  });

  it('initializes again once the session guard is cleared', async () => {
    // The failure is not permanent, just not automatic: a reload (or the
    // developer reset) starts a new session and tries once more.
    failNextWrite = true;
    const { result } = renderHook(() => usePostOnboardingGuide());
    await act(async () => {
      await result.current.initializeGuide();
    });
    expect(stored()).toBeUndefined();

    resetAutoWrites();
    await act(async () => {
      await result.current.initializeGuide();
    });
    expect(stored()?.status).toBe('active');
  });
});

describe('usePostOnboardingGuide — task progression', () => {
  beforeEach(reset);

  it('completes a task and reports progress', async () => {
    seed();
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.completePath('find-people');
    });

    expect(stored()?.paths['find-people']).toBe('completed');
    await waitFor(() => expect(result.current.completedCount).toBe(1));
  });

  it('is idempotent — re-completing a task writes nothing', async () => {
    seed();
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.completePath('find-people');
    });
    const afterFirst = writeCount;

    await act(async () => {
      await result.current.completePath('find-people');
      await result.current.completePath('find-people');
    });

    expect(writeCount).toBe(afterFirst);
  });

  it('composes rapid successive completions instead of clobbering them', async () => {
    seed();
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.completePath('find-people');
      await result.current.completePath('interact');
    });

    expect(stored()?.paths['find-people']).toBe('completed');
    expect(stored()?.paths.interact).toBe('completed');
  });

  it('completes the whole mission in the same write as the final task', async () => {
    seed();
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      for (const id of ALL_TASKS) await result.current.completePath(id);
    });

    // One atomic transition to `completed`, so the celebration fires once.
    expect(stored()?.status).toBe('completed');
    expect(typeof stored()?.completedAt).toBe('number');
  });

  it('persists progress across a remount', async () => {
    seed();
    const first = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await first.result.current.completePath('post-small');
    });
    first.unmount();

    const second = renderHook(() => usePostOnboardingGuide());
    await waitFor(() => expect(second.result.current.completedCount).toBe(1));
    expect(second.result.current.state?.paths['post-small']).toBe('completed');
  });

  it('records a baseline once and never moves the goalposts afterwards', async () => {
    seed();
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.recordBaseline({ follows: 3 });
    });
    expect(stored()?.baselines?.follows).toBe(3);
    const afterFirst = writeCount;

    // A later, larger observation must not raise the bar the user has to clear.
    await act(async () => {
      await result.current.recordBaseline({ follows: 99 });
    });
    expect(stored()?.baselines?.follows).toBe(3);
    expect(writeCount).toBe(afterFirst);
  });

  it('records an independent baseline for a different key', async () => {
    seed();
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.recordBaseline({ follows: 3 });
      await result.current.recordBaseline({ theme: 'builtin:dark' });
    });

    expect(stored()?.baselines).toEqual({ follows: 3, theme: 'builtin:dark' });
  });
});

describe('usePostOnboardingGuide — customize substeps', () => {
  beforeEach(reset);

  it('does not complete the task on the first substep alone', async () => {
    seed();
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.completeCustomizeStep('profile');
    });

    expect(stored()?.customize?.profileCompleted).toBe(true);
    expect(stored()?.paths.customize).toBe('active');
  });

  it('completes the task once both substeps land, in either order', async () => {
    for (const order of [['profile', 'theme'], ['theme', 'profile']] as const) {
      reset();
      seed();
      const { result } = renderHook(() => usePostOnboardingGuide());

      await act(async () => {
        for (const step of order) await result.current.completeCustomizeStep(step);
      });

      expect(stored()?.paths.customize).toBe('completed');
    }
  });

  it('is idempotent per substep', async () => {
    seed();
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.completeCustomizeStep('profile');
    });
    const afterFirst = writeCount;

    await act(async () => {
      await result.current.completeCustomizeStep('profile');
    });

    expect(writeCount).toBe(afterFirst);
  });

  it('survives a remount between the two substeps', async () => {
    seed();
    const first = renderHook(() => usePostOnboardingGuide());
    await act(async () => {
      await first.result.current.completeCustomizeStep('profile');
    });
    first.unmount();

    const second = renderHook(() => usePostOnboardingGuide());
    await waitFor(() => expect(second.result.current.state?.customize?.profileCompleted).toBe(true));

    await act(async () => {
      await second.result.current.completeCustomizeStep('theme');
    });
    expect(stored()?.paths.customize).toBe('completed');
  });
});

describe('usePostOnboardingGuide — dismissal vs. completion', () => {
  beforeEach(reset);

  it('dismissing preserves progress rather than discarding it', async () => {
    seed();
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.completePath('find-people');
      await result.current.dismissGuide();
    });

    expect(stored()?.status).toBe('skipped');
    expect(stored()?.paths['find-people']).toBe('completed');
    expect(typeof stored()?.skippedAt).toBe('number');
  });

  it('dismissing a completed mission keeps completedAt and any claim', async () => {
    seed({
      status: 'completed',
      completedAt: 5_000,
      paths: { 'find-people': 'completed', 'post-small': 'completed', customize: 'completed', interact: 'completed' },
      badgeClaim: { badge: 'ditto-explorer', status: 'claimed', claimEventId: 'f'.repeat(64), claimedAt: 6_000 },
    });
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.dismissGuide();
    });

    expect(stored()?.status).toBe('skipped');
    expect(stored()?.completedAt).toBe(5_000);
    // Hiding a card must never look like un-claiming a badge.
    expect(stored()?.badgeClaim?.status).toBe('claimed');
  });

  it('dismissing twice writes once', async () => {
    seed();
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.dismissGuide();
    });
    const afterFirst = writeCount;

    await act(async () => {
      await result.current.dismissGuide();
    });

    expect(writeCount).toBe(afterFirst);
  });

  it('a dismissed mission stops accepting task completions', async () => {
    seed({ status: 'skipped' });
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.completePath('interact');
    });

    expect(stored()?.paths.interact).toBe('not_started');
    expect(writeCount).toBe(0);
  });
});

describe('usePostOnboardingGuide — badge claim lifecycle', () => {
  beforeEach(reset);

  const completed = {
    status: 'completed' as const,
    completedAt: 5_000,
    paths: {
      'find-people': 'completed' as const,
      'post-small': 'completed' as const,
      customize: 'completed' as const,
      interact: 'completed' as const,
    },
  };

  it('refuses to begin a claim before the mission is complete', async () => {
    seed();
    const { result } = renderHook(() => usePostOnboardingGuide());

    let began: boolean | undefined;
    await act(async () => {
      began = await result.current.beginBadgeClaim();
    });

    expect(began).toBe(false);
    expect(stored()?.badgeClaim).toBeUndefined();
  });

  it('begins a claim once complete and stamps the in-flight time', async () => {
    seed(completed);
    const { result } = renderHook(() => usePostOnboardingGuide());

    let began: boolean | undefined;
    await act(async () => {
      began = await result.current.beginBadgeClaim();
    });

    expect(began).toBe(true);
    expect(stored()?.badgeClaim?.status).toBe('claiming');
    expect(typeof stored()?.badgeClaim?.claimingStartedAt).toBe('number');
  });

  it('refuses a second claim while one is genuinely in flight', async () => {
    seed(completed);
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.beginBadgeClaim();
    });

    let second: boolean | undefined;
    await act(async () => {
      second = await result.current.beginBadgeClaim();
    });

    // The caller uses this to decide whether to publish — so `false` here is
    // what prevents a duplicate claim event.
    expect(second).toBe(false);
  });

  it('refuses to re-claim an already-claimed badge', async () => {
    seed({
      ...completed,
      badgeClaim: { badge: 'ditto-explorer', status: 'claimed', claimEventId: 'f'.repeat(64), claimedAt: 6_000 },
    });
    const { result } = renderHook(() => usePostOnboardingGuide());

    let began: boolean | undefined;
    await act(async () => {
      began = await result.current.beginBadgeClaim();
    });

    expect(began).toBe(false);
    expect(stored()?.badgeClaim?.claimEventId).toBe('f'.repeat(64));
  });

  it('allows a retry after a stale in-flight claim (app died mid-publish)', async () => {
    seed({
      ...completed,
      badgeClaim: {
        badge: 'ditto-explorer',
        status: 'claiming',
        claimingStartedAt: Date.now() - 10 * 60_000,
      },
    });
    const { result } = renderHook(() => usePostOnboardingGuide());

    let began: boolean | undefined;
    await act(async () => {
      began = await result.current.beginBadgeClaim();
    });

    expect(began).toBe(true);
  });

  it('records a failure as retryable and then succeeds on retry', async () => {
    seed(completed);
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.beginBadgeClaim();
      await result.current.failBadgeClaim();
    });
    expect(stored()?.badgeClaim?.status).toBe('failed');
    await waitFor(() => expect(result.current.rewardView).toBe('failed'));

    await act(async () => {
      const began = await result.current.beginBadgeClaim();
      expect(began).toBe(true);
      await result.current.completeBadgeClaim('a'.repeat(64));
    });

    expect(stored()?.badgeClaim?.status).toBe('claimed');
    expect(stored()?.badgeClaim?.claimEventId).toBe('a'.repeat(64));
  });

  it('never lets a failure clobber a successful claim', async () => {
    seed({
      ...completed,
      badgeClaim: { badge: 'ditto-explorer', status: 'claimed', claimEventId: 'f'.repeat(64) },
    });
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.failBadgeClaim();
      await result.current.completeBadgeClaim('b'.repeat(64));
    });

    expect(stored()?.badgeClaim?.status).toBe('claimed');
    expect(stored()?.badgeClaim?.claimEventId).toBe('f'.repeat(64));
    expect(writeCount).toBe(0);
  });

  it('exposes the reward state the UI should render', async () => {
    seed(completed);
    const { result } = renderHook(() => usePostOnboardingGuide());
    await waitFor(() => expect(result.current.rewardView).toBe('ready'));

    await act(async () => {
      await result.current.beginBadgeClaim();
    });
    await waitFor(() => expect(result.current.rewardView).toBe('claiming'));

    await act(async () => {
      await result.current.completeBadgeClaim('a'.repeat(64));
    });
    await waitFor(() => expect(result.current.rewardView).toBe('claimed'));
  });
});

describe('usePostOnboardingGuide — introduction lifecycle', () => {
  beforeEach(reset);

  it('a freshly initialized mission has the introduction pending', async () => {
    const { result } = renderHook(() => usePostOnboardingGuide());
    await act(async () => {
      await result.current.initializeGuide();
    });

    expect(stored()?.intro).toEqual({});
    await waitFor(() => expect(result.current.introState).toBe('pending'));
    expect(result.current.canShowDetail).toBe(false);
  });

  it('acknowledging reveals the mission detail', async () => {
    seed();
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.acknowledgeIntro();
    });

    expect(stored()?.intro?.acknowledgedAt).toBeTypeOf('number');
    await waitFor(() => expect(result.current.canShowDetail).toBe(true));
    expect(result.current.introOutstanding).toBe(false);
  });

  it('"Maybe later" postpones the introduction and never skips the mission', async () => {
    seed();
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.postponeIntro();
    });

    expect(stored()?.intro?.postponedAt).toBeTypeOf('number');
    // The mission stays active: progress keeps being detected, /missions keeps
    // offering the introduction, and nothing was permanently skipped.
    expect(stored()?.status).toBe('active');
    expect(stored()?.skippedAt).toBeUndefined();
    await waitFor(() => expect(result.current.introState).toBe('postponed'));
    expect(result.current.introOutstanding).toBe(true);
  });

  it('acknowledging after postponing clears the postponement', async () => {
    seed({ intro: { postponedAt: 500 } });
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.acknowledgeIntro();
    });

    expect(stored()?.intro?.postponedAt).toBeUndefined();
    expect(stored()?.intro?.acknowledgedAt).toBeTypeOf('number');
  });

  it('is idempotent — re-acknowledging writes nothing', async () => {
    seed();
    const { result } = renderHook(() => usePostOnboardingGuide());
    await act(async () => {
      await result.current.acknowledgeIntro();
    });
    const afterFirst = writeCount;

    await act(async () => {
      await result.current.acknowledgeIntro();
      await result.current.postponeIntro();
    });

    expect(writeCount).toBe(afterFirst);
  });

  it('records that the introduction was presented, without advancing it', async () => {
    seed();
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.markIntroPresented();
    });

    expect(stored()?.intro?.presentedAt).toBeTypeOf('number');
    await waitFor(() => expect(result.current.introState).toBe('pending'));
  });

  it('still owes an introduction to a state that lost its intro object', async () => {
    // Every mission is created with `intro: {}`, so this only covers a state
    // that lost it. Detail stays withheld and the introduction is offered
    // again, which is dismissible and touches no progress.
    const withoutIntro = createInitialGuideState(1_000);
    delete (withoutIntro as { intro?: unknown }).intro;
    settings = { postOnboardingGuide: withoutIntro } as EncryptedSettings;

    const { result } = renderHook(() => usePostOnboardingGuide());
    await waitFor(() => expect(result.current.introState).toBe('pending'));
    expect(result.current.introOutstanding).toBe(true);
    expect(result.current.canShowDetail).toBe(false);
  });
});

describe('usePostOnboardingGuide — hide and resume', () => {
  beforeEach(reset);

  it('resumes a hidden mission back to active', async () => {
    seed({ status: 'skipped', skippedAt: 2_000 });
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.resumeGuide();
    });

    expect(stored()?.status).toBe('active');
    expect(stored()?.skippedAt).toBeUndefined();
    await waitFor(() => expect(result.current.isActive).toBe(true));
  });

  it('resuming preserves progress', async () => {
    seed({
      status: 'skipped',
      skippedAt: 2_000,
      paths: {
        'find-people': 'completed',
        'post-small': 'completed',
        customize: 'not_started',
        interact: 'not_started',
      },
    });
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.resumeGuide();
    });

    expect(stored()?.paths['find-people']).toBe('completed');
    expect(stored()?.paths['post-small']).toBe('completed');
  });

  it('resuming a finished-then-hidden mission returns it to completed', async () => {
    // So the reward is reachable again rather than the mission looking unfinished.
    seed({
      status: 'skipped',
      skippedAt: 2_000,
      completedAt: 1_500,
      paths: {
        'find-people': 'completed',
        'post-small': 'completed',
        customize: 'completed',
        interact: 'completed',
      },
    });
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.resumeGuide();
    });

    expect(stored()?.status).toBe('completed');
    expect(stored()?.completedAt).toBe(1_500);
  });

  it('resuming preserves a published badge claim', async () => {
    seed({
      status: 'skipped',
      skippedAt: 2_000,
      badgeClaim: { badge: 'ditto-explorer', status: 'claimed', claimEventId: 'f'.repeat(64) },
    });
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.resumeGuide();
    });

    expect(stored()?.badgeClaim?.status).toBe('claimed');
  });

  it('resuming a mission that is not hidden is a no-op', async () => {
    seed();
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.resumeGuide();
    });

    expect(writeCount).toBe(0);
  });

  it('hide then resume then hide is stable', async () => {
    seed();
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.dismissGuide();
      await result.current.resumeGuide();
      await result.current.dismissGuide();
    });

    expect(stored()?.status).toBe('skipped');
    expect(stored()?.paths['find-people']).toBe('not_started');
  });
});

/**
 * Regression suite for the mission-persistence loop.
 *
 * `markIntroPresented` was called from an effect keyed on the callback itself.
 * The callback's identity changed on every render (it closed over react-query's
 * `updateSettings`, a fresh object each render), and a failing write re-rendered
 * by itself, because the mutation's own pending -> error transition is a state
 * change. Every attempt also minted a new `Date.now()`, so nothing could
 * recognise it as the same write. Measured in the browser at ~4,650 attempts per
 * second and 116,664 in thirty seconds.
 *
 * These tests assert **bounded call counts**, not "fewer errors".
 */
describe('usePostOnboardingGuide — automatic writes are bounded', () => {
  beforeEach(reset);

  it('attempts an informational write once, however many times it is called', async () => {
    seed();
    const { result, rerender } = renderHook(() => usePostOnboardingGuide());
    await waitFor(() => expect(result.current.state).toBeDefined());

    await act(async () => {
      await result.current.markIntroPresented();
    });
    expect(writeCount).toBe(1);

    // The shape of the original bug: re-render and call again, many times.
    for (let i = 0; i < 50; i++) {
      rerender();
      await act(async () => {
        await result.current.markIntroPresented();
      });
    }
    expect(writeCount).toBe(1);
  });

  it('keeps the setter identity stable across renders', async () => {
    // This is what let an effect keyed on the setter re-run every render. It is
    // the actual driver: with identity stable the loop does not start even with
    // the session guard removed.
    seed();
    const { result, rerender } = renderHook(() => usePostOnboardingGuide());
    await waitFor(() => expect(result.current.state).toBeDefined());

    const first = result.current.markIntroPresented;
    const firstInit = result.current.initializeGuide;
    for (let i = 0; i < 20; i++) rerender();
    expect(result.current.markIntroPresented).toBe(first);
    expect(result.current.initializeGuide).toBe(firstInit);
  });

  it('does not retry a failed informational write on later renders', async () => {
    seed();
    failNextWrite = true;
    const { result, rerender } = renderHook(() => usePostOnboardingGuide());
    await waitFor(() => expect(result.current.state).toBeDefined());

    await act(async () => {
      await result.current.markIntroPresented();
    });
    expect(writeCount).toBe(1);
    expect(stored()?.intro?.presentedAt).toBeUndefined();

    for (let i = 0; i < 50; i++) {
      rerender();
      await act(async () => {
        await result.current.markIntroPresented();
      });
    }
    // Still exactly the one failed attempt. Never blocks the experience:
    // the introduction is unaffected by whether this landed.
    expect(writeCount).toBe(1);
    expect(result.current.introState).toBe('pending');
  });

  it('does not mint a fresh timestamp per attempt', async () => {
    // A new `Date.now()` on every attempt made each write look like a brand-new
    // state, defeating every equality check.
    seed();
    failNextWrite = true;
    const { result, rerender } = renderHook(() => usePostOnboardingGuide());
    await waitFor(() => expect(result.current.state).toBeDefined());

    for (let i = 0; i < 20; i++) {
      rerender();
      await act(async () => {
        await result.current.markIntroPresented();
      });
    }
    const presented = mutateAsync.mock.calls
      .map((c) => (c[0] as { postOnboardingGuide?: PostOnboardingGuideState })
        .postOnboardingGuide?.intro?.presentedAt);
    expect(presented.length).toBe(1);
    expect(new Set(presented).size).toBe(1);
  });

  it('lets two mounted surfaces write the transition only once between them', async () => {
    // Sidebar widget, mobile teaser, /missions and the arrival destination can
    // all be mounted at once. A component-local flag cannot see the others.
    seed();
    const a = renderHook(() => usePostOnboardingGuide());
    const b = renderHook(() => usePostOnboardingGuide());
    await waitFor(() => expect(a.result.current.state).toBeDefined());
    await waitFor(() => expect(b.result.current.state).toBeDefined());

    await act(async () => {
      await Promise.all([
        a.result.current.markIntroPresented(),
        b.result.current.markIntroPresented(),
      ]);
    });
    expect(writeCount).toBe(1);
  });

  it('does not write again when the same surface remounts', async () => {
    seed();
    const first = renderHook(() => usePostOnboardingGuide());
    await waitFor(() => expect(first.result.current.state).toBeDefined());
    await act(async () => {
      await first.result.current.markIntroPresented();
    });
    expect(writeCount).toBe(1);
    first.unmount();

    for (let i = 0; i < 5; i++) {
      const again = renderHook(() => usePostOnboardingGuide());
      await waitFor(() => expect(again.result.current.state).toBeDefined());
      await act(async () => {
        await again.result.current.markIntroPresented();
      });
      again.unmount();
    }
    expect(writeCount).toBe(1);
  });

  it('does not restart a failed write when sync re-delivers the old state', async () => {
    // The relay legitimately still holds the pre-write state, so the reducer
    // would happily produce the same transition again, forever.
    seed();
    failNextWrite = true;
    const { result } = renderHook(() => usePostOnboardingGuide());
    await waitFor(() => expect(result.current.state).toBeDefined());
    await act(async () => {
      await result.current.markIntroPresented();
    });
    expect(writeCount).toBe(1);

    for (let i = 0; i < 10; i++) {
      // A fresh delivery of the same mission state, as NostrSync would do.
      await act(async () => {
        seed();
        emit();
      });
      await act(async () => {
        await result.current.markIntroPresented();
      });
    }
    expect(writeCount).toBe(1);
  });

  it('leaves deliberate user actions fully retryable', async () => {
    // Only automatic writes are one-shot. A user who taps again gets a real
    // second attempt — the guard must not strand a real decision.
    seed();
    failNextWrite = true;
    const { result } = renderHook(() => usePostOnboardingGuide());
    await waitFor(() => expect(result.current.state).toBeDefined());

    await act(async () => {
      await result.current.acknowledgeIntro();
    });
    expect(stored()?.intro?.acknowledgedAt).toBeUndefined();
    expect(writeCount).toBe(1);

    await act(async () => {
      await result.current.acknowledgeIntro();
    });
    expect(writeCount).toBe(2);
    expect(stored()?.intro?.acknowledgedAt).toBeGreaterThan(0);
  });

  it('performs zero real writes while the harness owns the state', async () => {
    devState = createInitialGuideState(5_000);
    const { result, rerender } = renderHook(() => usePostOnboardingGuide());
    await waitFor(() => expect(result.current.state).toBeDefined());

    for (let i = 0; i < 20; i++) {
      rerender();
      await act(async () => {
        await result.current.markIntroPresented();
        await result.current.initializeGuide();
      });
    }
    expect(writeCount).toBe(0);
    expect(mutateAsync).not.toHaveBeenCalled();
    devState = undefined;
  });
});

/**
 * Account isolation.
 *
 * The hook keeps an in-memory snapshot of the freshest mission state it has
 * written (`latestRef`), so rapid successive transitions in one tab compose
 * instead of clobbering each other. That snapshot belongs to exactly one
 * account. It used to be seeded only from a *truthy* state, which meant an
 * account switch left the previous account's mission sitting in it: the new
 * account reports `undefined` while it has no mission, so nothing overwrote it.
 *
 * Two things went wrong from there, and both are covered below: the new account
 * could not initialize (an occupied snapshot reads as "already has a mission"),
 * and any later transition reduced from the *previous* account's state and
 * wrote the result into the new account's settings.
 */
describe('usePostOnboardingGuide — account isolation', () => {
  beforeEach(reset);

  const A = 'a'.repeat(64);
  const B = 'b'.repeat(64);

  it('lets an account with no mission initialize after switching from one that has', async () => {
    pubkey = A;
    seed({ paths: { 'find-people': 'completed', 'post-small': 'completed', customize: 'not_started', interact: 'not_started' } });
    const { result, rerender } = renderHook(() => usePostOnboardingGuide());
    await waitFor(() => expect(result.current.completedCount).toBe(2));
    const accountAState = stored();

    act(() => switchAccount(B));
    rerender();
    expect(result.current.state).toBeUndefined();

    await act(async () => {
      await result.current.initializeGuide();
    });

    // B gets a mission of its own, at zero progress — not A's.
    expect(stored()).toBeDefined();
    expect(stored()?.paths).toEqual({
      'find-people': 'not_started',
      'post-small': 'not_started',
      customize: 'not_started',
      interact: 'not_started',
    });
    expect(result.current.completedCount).toBe(0);

    // A's own state was never touched.
    act(() => switchAccount(A));
    expect(accounts.get(A)?.postOnboardingGuide).toEqual(accountAState);
  });

  it('never reduces a transition from the previous account’s state', async () => {
    pubkey = A;
    seed({ paths: { 'find-people': 'completed', 'post-small': 'completed', customize: 'completed', interact: 'not_started' } });
    const { result, rerender } = renderHook(() => usePostOnboardingGuide());
    await waitFor(() => expect(result.current.completedCount).toBe(3));

    act(() => switchAccount(B));
    rerender();

    await act(async () => {
      await result.current.initializeGuide();
    });
    await act(async () => {
      await result.current.completePath('find-people');
    });

    // Exactly one task done. If the write had composed onto A's snapshot this
    // would read 4/4 — and would have carried A's progress into B's settings.
    expect(stored()?.paths['find-people']).toBe('completed');
    expect(stored()?.paths['post-small']).toBe('not_started');
    expect(stored()?.paths.customize).toBe('not_started');
    expect(result.current.completedCount).toBe(1);
    expect(result.current.isCompleted).toBe(false);
  });

  it('follows the first account’s own state when switching back', async () => {
    pubkey = A;
    seed({ paths: { 'find-people': 'completed', 'post-small': 'not_started', customize: 'not_started', interact: 'not_started' } });
    const { result, rerender } = renderHook(() => usePostOnboardingGuide());
    await waitFor(() => expect(result.current.completedCount).toBe(1));

    act(() => switchAccount(B));
    rerender();
    await act(async () => {
      await result.current.initializeGuide();
      await result.current.completePath('interact');
    });
    expect(result.current.completedCount).toBe(1);

    act(() => switchAccount(A));
    rerender();
    await waitFor(() => expect(result.current.completedCount).toBe(1));

    // Back on A, a transition composes onto A — not onto whatever B last wrote.
    await act(async () => {
      await result.current.completePath('post-small');
    });
    expect(stored()?.paths['find-people']).toBe('completed');
    expect(stored()?.paths['post-small']).toBe('completed');
    expect(stored()?.paths.interact).toBe('not_started');
  });

  it('keeps the automatic-write guard scoped per account', async () => {
    pubkey = A;
    const { result, rerender } = renderHook(() => usePostOnboardingGuide());
    await act(async () => {
      await result.current.initializeGuide();
    });
    expect(writeCount).toBe(1);

    // A second attempt for A is refused for the rest of the session…
    await act(async () => {
      await result.current.initializeGuide();
    });
    expect(writeCount).toBe(1);

    // …but B is a different account and gets its own single attempt.
    act(() => switchAccount(B));
    rerender();
    await act(async () => {
      await result.current.initializeGuide();
    });
    expect(writeCount).toBe(2);
    await act(async () => {
      await result.current.initializeGuide();
    });
    expect(writeCount).toBe(2);
  });

  it('a failed write before a switch cannot restart writes on the new account', async () => {
    pubkey = A;
    seed();
    const { result, rerender } = renderHook(() => usePostOnboardingGuide());
    await waitFor(() => expect(result.current.state).toBeDefined());

    failNextWrite = true;
    await act(async () => {
      await result.current.completePath('find-people');
    });
    expect(writeCount).toBe(1);
    expect(stored()?.paths['find-people']).toBe('not_started');

    act(() => switchAccount(B));
    rerender();

    // The rolled-back snapshot belonged to A and must not survive the switch:
    // B reads as having no mission, and re-rendering does not write anything.
    expect(result.current.state).toBeUndefined();
    for (let i = 0; i < 10; i++) rerender();
    expect(writeCount).toBe(1);

    // B still initializes exactly once.
    await act(async () => {
      await result.current.initializeGuide();
    });
    expect(writeCount).toBe(2);
    expect(result.current.completedCount).toBe(0);
  });
});
