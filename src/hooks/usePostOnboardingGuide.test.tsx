import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSyncExternalStore } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';

import { usePostOnboardingGuide } from './usePostOnboardingGuide';
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

vi.mock('./useEncryptedSettings', () => ({
  useEncryptedSettings: () => ({
    settings: useSyncExternalStore(subscribe, () => settings),
    isLoading,
    updateSettings: { mutateAsync, isPending: false },
    hasNip44Support: true,
  }),
}));

function reset() {
  settings = undefined;
  isLoading = false;
  writeCount = 0;
  failNextWrite = false;
  listeners.clear();
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

const ALL_TASKS = ['find-people', 'post-small', 'customize', 'explore'] as const;

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
    seed({ paths: { 'find-people': 'completed', 'post-small': 'not_started', customize: 'not_started', explore: 'not_started' } });
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

  it('rolls back its local snapshot when the write fails, so a retry works', async () => {
    failNextWrite = true;
    const { result } = renderHook(() => usePostOnboardingGuide());

    await act(async () => {
      await result.current.initializeGuide();
    });
    expect(stored()).toBeUndefined();

    // The failed attempt must not have latched anything that blocks a retry.
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
      await result.current.completePath('explore');
    });

    expect(stored()?.paths['find-people']).toBe('completed');
    expect(stored()?.paths.explore).toBe('completed');
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
      paths: { 'find-people': 'completed', 'post-small': 'completed', customize: 'completed', explore: 'completed' },
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
      await result.current.completePath('explore');
    });

    expect(stored()?.paths.explore).toBe('not_started');
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
      explore: 'completed' as const,
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

  it('legacy states never resurface the introduction', async () => {
    // A state written before the feature existed has no `intro` key.
    const legacy = createInitialGuideState(1_000);
    delete (legacy as { intro?: unknown }).intro;
    settings = { postOnboardingGuide: legacy } as EncryptedSettings;

    const { result } = renderHook(() => usePostOnboardingGuide());
    await waitFor(() => expect(result.current.introState).toBe('none'));
    expect(result.current.introOutstanding).toBe(false);
    expect(result.current.canShowDetail).toBe(true);
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
        explore: 'not_started',
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
        explore: 'completed',
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
