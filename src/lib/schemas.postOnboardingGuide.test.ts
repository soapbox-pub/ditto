import { describe, expect, it } from 'vitest';

import { EncryptedSettingsSchema, PostOnboardingGuideStateSchema } from './schemas';
import { createInitialGuideState } from './postOnboardingGuide';

describe('PostOnboardingGuideStateSchema', () => {
  it('round-trips a freshly created mission state', () => {
    const state = createInitialGuideState(1_000);
    expect(PostOnboardingGuideStateSchema.parse(state)).toEqual(state);
  });

  it('accepts state with no badgeClaim, customize, or baselines', () => {
    const parsed = PostOnboardingGuideStateSchema.parse(createInitialGuideState(1_000));
    expect(parsed.badgeClaim).toBeUndefined();
    expect(parsed.customize).toBeUndefined();
    expect(parsed.baselines).toBeUndefined();
  });

  it('round-trips every badgeClaim status, including failed', () => {
    for (const status of ['unclaimed', 'claiming', 'claimed', 'failed'] as const) {
      const state = {
        ...createInitialGuideState(1_000),
        status: 'completed' as const,
        badgeClaim: { badge: 'ditto-explorer' as const, status },
      };
      expect(PostOnboardingGuideStateSchema.parse(state).badgeClaim?.status).toBe(status);
    }
  });

  it('round-trips a claimed badgeClaim with its event id and timestamp', () => {
    const state = {
      ...createInitialGuideState(1_000),
      status: 'completed' as const,
      badgeClaim: {
        badge: 'ditto-explorer' as const,
        status: 'claimed' as const,
        claimEventId: 'f'.repeat(64),
        claimedAt: 1_700_000_000_000,
      },
    };
    const parsed = PostOnboardingGuideStateSchema.parse(state);
    expect(parsed.badgeClaim?.claimEventId).toBe('f'.repeat(64));
    expect(parsed.badgeClaim?.claimedAt).toBe(1_700_000_000_000);
  });

  it('round-trips customize substeps and baselines', () => {
    const state = {
      ...createInitialGuideState(1_000),
      customize: { profileCompleted: true, themeCompleted: false },
      baselines: { follows: 7, theme: 'builtin:dark' },
    };
    const parsed = PostOnboardingGuideStateSchema.parse(state);
    expect(parsed.customize).toEqual({ profileCompleted: true, themeCompleted: false });
    expect(parsed.baselines).toEqual({ follows: 7, theme: 'builtin:dark' });
  });

  it('rejects an unknown badge or an invalid claim status', () => {
    const base = { ...createInitialGuideState(1_000), status: 'completed' as const };
    expect(() =>
      PostOnboardingGuideStateSchema.parse({
        ...base,
        badgeClaim: { badge: 'something-else', status: 'unclaimed' },
      }),
    ).toThrow();
    expect(() =>
      PostOnboardingGuideStateSchema.parse({
        ...base,
        badgeClaim: { badge: 'ditto-explorer', status: 'pending' },
      }),
    ).toThrow();
  });

  // The mission is written by whichever client version the user is running; a
  // newer one may add tasks, substeps, or baselines this build has never heard
  // of. Because the hook persists `{ ...state, ...changes }`, anything the
  // schema strips on parse is destroyed on the very next write.
  describe('forward compatibility', () => {
    it('preserves unknown top-level mission fields', () => {
      const state = {
        ...createInitialGuideState(1_000),
        futureMission: { id: 'ditto-native', progress: 3 },
      };
      const parsed = PostOnboardingGuideStateSchema.parse(state) as Record<string, unknown>;
      expect(parsed.futureMission).toEqual({ id: 'ditto-native', progress: 3 });
    });

    it('preserves unknown tasks alongside the known ones', () => {
      const state = createInitialGuideState(1_000);
      const withFutureTask = {
        ...state,
        paths: { ...state.paths, 'send-zap': 'completed' },
      };
      const parsed = PostOnboardingGuideStateSchema.parse(withFutureTask);
      expect((parsed.paths as Record<string, string>)['send-zap']).toBe('completed');
      expect(parsed.paths['find-people']).toBe('not_started');
    });

    it('preserves unknown substeps, baselines, and claim fields', () => {
      const state = {
        ...createInitialGuideState(1_000),
        status: 'completed' as const,
        customize: { profileCompleted: true, bannerCompleted: true },
        baselines: { follows: 2, relayCount: 5 },
        badgeClaim: { badge: 'ditto-explorer' as const, status: 'claimed' as const, awardEventId: 'x' },
      };
      const parsed = PostOnboardingGuideStateSchema.parse(state);
      expect((parsed.customize as Record<string, unknown>).bannerCompleted).toBe(true);
      expect((parsed.baselines as Record<string, unknown>).relayCount).toBe(5);
      expect((parsed.badgeClaim as Record<string, unknown>).awardEventId).toBe('x');
    });

    it('carries the mission through a full encrypted-settings round-trip', () => {
      const settings = {
        theme: 'dark',
        postOnboardingGuide: {
          ...createInitialGuideState(1_000),
          futureMission: { id: 'x' },
        },
      };
      const parsed = EncryptedSettingsSchema.parse(settings);
      const mission = parsed.postOnboardingGuide as Record<string, unknown>;
      expect(mission.futureMission).toEqual({ id: 'x' });
    });
  });

  it('tolerates a legacy `source` field without reintroducing signup behavior', () => {
    // States written by the abandoned signup-coupled implementation carried a
    // `source: 'signup' | 'existing'` discriminator. It must parse (so old data
    // isn't rejected) and survive a rewrite (so nothing is silently destroyed),
    // but nothing in the current system reads it.
    const legacy = { ...createInitialGuideState(1_000), source: 'signup' };
    const parsed = PostOnboardingGuideStateSchema.parse(legacy) as Record<string, unknown>;
    expect(parsed.source).toBe('signup');
    expect(parsed.status).toBe('active');
  });
});
