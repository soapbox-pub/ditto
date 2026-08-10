import { describe, it, expect } from 'vitest';

import {
  canShowMissionDetail,
  createInitialGuideState,
  introState,
  isIntroOutstanding,
  nextRecommendedPath,
  type PostOnboardingGuideState,
} from './postOnboardingGuide';
import { PostOnboardingGuideStateSchema } from './schemas';

/** A state as written before the introduction existed: no `intro` key at all. */
function legacyState(): PostOnboardingGuideState {
  const state = createInitialGuideState(1_000);
  const { intro: _intro, ...rest } = state;
  return rest as PostOnboardingGuideState;
}

describe('mission introduction lifecycle', () => {
  it('a newly created mission begins with the introduction pending', () => {
    const state = createInitialGuideState(1_000);
    expect(state.intro).toEqual({});
    expect(introState(state)).toBe('pending');
    expect(isIntroOutstanding(state)).toBe(true);
  });

  it('withholds task detail until the introduction is acknowledged', () => {
    const state = createInitialGuideState(1_000);
    expect(canShowMissionDetail(state)).toBe(false);
  });

  it('reads a state that somehow lost its intro object as still owing one', () => {
    // Every mission is created with `intro: {}`, so this only covers a state
    // that lost it. Offering the introduction again is the harmless outcome:
    // it is dismissible and changes nothing about the mission's progress.
    const withoutIntro = legacyState();
    expect(introState(withoutIntro)).toBe('pending');
    expect(isIntroOutstanding(withoutIntro)).toBe(true);
    expect(canShowMissionDetail(withoutIntro)).toBe(false);
  });

  it('acknowledging reveals the mission detail', () => {
    const state: PostOnboardingGuideState = {
      ...createInitialGuideState(1_000),
      intro: { acknowledgedAt: 2_000 },
    };
    expect(introState(state)).toBe('acknowledged');
    expect(isIntroOutstanding(state)).toBe(false);
    expect(canShowMissionDetail(state)).toBe(true);
  });

  it('"Maybe later" postpones the introduction without hiding the mission', () => {
    const state: PostOnboardingGuideState = {
      ...createInitialGuideState(1_000),
      intro: { postponedAt: 2_000 },
    };
    expect(introState(state)).toBe('postponed');
    // Still outstanding: /missions keeps offering it.
    expect(isIntroOutstanding(state)).toBe(true);
    // And emphatically not a skip — the mission itself is untouched.
    expect(state.status).toBe('active');
    expect(canShowMissionDetail(state)).toBe(false);
  });

  it('acknowledgement wins over a prior postponement', () => {
    const state: PostOnboardingGuideState = {
      ...createInitialGuideState(1_000),
      intro: { postponedAt: 2_000, acknowledgedAt: 3_000 },
    };
    expect(introState(state)).toBe('acknowledged');
  });

  it('offers nothing when there is no mission at all', () => {
    expect(canShowMissionDetail(undefined)).toBe(false);
  });
});

describe('intro schema compatibility', () => {
  it('round-trips the intro object', () => {
    const state: PostOnboardingGuideState = {
      ...createInitialGuideState(1_000),
      intro: { presentedAt: 1, acknowledgedAt: 2, postponedAt: 3 },
    };
    const parsed = PostOnboardingGuideStateSchema.parse(state);
    expect(parsed.intro).toEqual({ presentedAt: 1, acknowledgedAt: 2, postponedAt: 3 });
  });

  it('accepts a legacy state with no intro key', () => {
    expect(() => PostOnboardingGuideStateSchema.parse(legacyState())).not.toThrow();
  });

  it('preserves unknown future intro fields', () => {
    const state = {
      ...createInitialGuideState(1_000),
      intro: { acknowledgedAt: 2, replayedAt: 9 },
    };
    const parsed = PostOnboardingGuideStateSchema.parse(state);
    expect((parsed.intro as Record<string, unknown>).replayedAt).toBe(9);
  });

  it('leaves version and status untouched', () => {
    // Adding a status value or bumping the version would fail validation on
    // older clients and drop them into the raw-JSON fallback for the *whole*
    // settings object. The introduction must not cost that.
    const state = createInitialGuideState(1_000);
    expect(state.version).toBe(1);
    expect(['active', 'completed', 'skipped']).toContain(state.status);
  });
});

describe('nextRecommendedPath', () => {
  it('is the first unfinished task by default', () => {
    expect(nextRecommendedPath(createInitialGuideState(1_000))).toBe('find-people');
  });

  it('prefers the task the user actually started', () => {
    // Otherwise a compact surface says "next: post something small" while the
    // user is standing in the middle of the customize flow.
    const state: PostOnboardingGuideState = {
      ...createInitialGuideState(1_000),
      activePath: 'customize',
    };
    expect(nextRecommendedPath(state)).toBe('customize');
  });

  it('falls back to canonical order once the started task is finished', () => {
    const state = createInitialGuideState(1_000);
    state.paths.customize = 'completed';
    expect(nextRecommendedPath({ ...state, activePath: 'customize' })).toBe('find-people');
  });

  it('is undefined when everything is done', () => {
    const state = createInitialGuideState(1_000);
    for (const id of ['find-people', 'post-small', 'customize', 'interact'] as const) {
      state.paths[id] = 'completed';
    }
    expect(nextRecommendedPath(state)).toBeUndefined();
  });
});
