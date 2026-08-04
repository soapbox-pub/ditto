import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  PUBLISH_CLOCK_SKEW_MS,
  STALE_CLAIMING_TIMEOUT_MS,
  areAllPathsCompleted,
  badgeRewardView,
  countCompletedPaths,
  createInitialGuideState,
  hasMeaningfulProfile,
  isClaimInFlight,
  isProfileTaskSatisfied,
  isQualifyingStarterPost,
  themeSignature,
  type PostOnboardingBadgeClaim,
  type PostOnboardingGuideState,
} from './postOnboardingGuide';

const PUBKEY = 'a'.repeat(64);
const OTHER_PUBKEY = 'b'.repeat(64);
const STARTED_AT = 1_700_000_000_000;

/** Mission state with an arbitrary set of tasks marked complete. */
function stateWith(
  completed: Array<'find-people' | 'post-small' | 'customize' | 'explore'>,
  overrides: Partial<PostOnboardingGuideState> = {},
): PostOnboardingGuideState {
  const base = createInitialGuideState(STARTED_AT);
  for (const id of completed) base.paths[id] = 'completed';
  const allDone = areAllPathsCompleted(base);
  return { ...base, status: allDone ? 'completed' : 'active', ...overrides };
}

function makeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'f'.repeat(64),
    pubkey: PUBKEY,
    kind: 1,
    created_at: Math.floor(STARTED_AT / 1000) + 60,
    content: 'hello',
    tags: [],
    sig: 'c'.repeat(128),
    ...overrides,
  };
}

describe('createInitialGuideState', () => {
  it('starts active with every task not_started and no badgeClaim', () => {
    const state = createInitialGuideState(1_000);
    expect(state.status).toBe('active');
    expect(state.startedAt).toBe(1_000);
    expect(state.updatedAt).toBe(1_000);
    expect(state.badgeClaim).toBeUndefined();
    expect(state.baselines).toBeUndefined();
    expect(countCompletedPaths(state)).toBe(0);
    expect(areAllPathsCompleted(state)).toBe(false);
  });

  it('carries no signup/source concept at all', () => {
    // The mission is signup-independent by construction: there is nowhere to
    // record how the account was created, so no surface can branch on it.
    const state = createInitialGuideState(1_000) as unknown as Record<string, unknown>;
    expect(state.source).toBeUndefined();
    expect(Object.keys(state)).not.toContain('source');
  });
});

describe('progress counting', () => {
  it('counts completed tasks', () => {
    expect(countCompletedPaths(stateWith([]))).toBe(0);
    expect(countCompletedPaths(stateWith(['find-people', 'explore']))).toBe(2);
  });

  it('reports all-complete only when every task is done', () => {
    expect(areAllPathsCompleted(stateWith(['find-people', 'post-small', 'customize']))).toBe(false);
    expect(
      areAllPathsCompleted(stateWith(['find-people', 'post-small', 'customize', 'explore'])),
    ).toBe(true);
  });
});

describe('isClaimInFlight (stuck-claiming recovery)', () => {
  const now = 10_000_000;

  it('returns false when there is no claim', () => {
    expect(isClaimInFlight(undefined, now)).toBe(false);
  });

  it('returns false for unclaimed / claimed / failed statuses', () => {
    for (const status of ['unclaimed', 'claimed', 'failed'] as const) {
      const claim: PostOnboardingBadgeClaim = { badge: 'ditto-explorer', status };
      expect(isClaimInFlight(claim, now)).toBe(false);
    }
  });

  it('treats a recent claiming state as in-flight', () => {
    const claim: PostOnboardingBadgeClaim = {
      badge: 'ditto-explorer',
      status: 'claiming',
      claimingStartedAt: now - 1_000,
    };
    expect(isClaimInFlight(claim, now)).toBe(true);
  });

  it('treats a claiming state older than the timeout as retryable', () => {
    const claim: PostOnboardingBadgeClaim = {
      badge: 'ditto-explorer',
      status: 'claiming',
      claimingStartedAt: now - STALE_CLAIMING_TIMEOUT_MS - 1,
    };
    expect(isClaimInFlight(claim, now)).toBe(false);
  });

  it('treats a claiming state with no start timestamp as retryable', () => {
    const claim: PostOnboardingBadgeClaim = { badge: 'ditto-explorer', status: 'claiming' };
    expect(isClaimInFlight(claim, now)).toBe(false);
  });

  it('is exclusive at the timeout boundary', () => {
    const claim: PostOnboardingBadgeClaim = {
      badge: 'ditto-explorer',
      status: 'claiming',
      claimingStartedAt: now - STALE_CLAIMING_TIMEOUT_MS,
    };
    expect(isClaimInFlight(claim, now)).toBe(false);
  });
});

describe('badgeRewardView', () => {
  const now = STARTED_AT + 1_000_000;
  const allDone = ['find-people', 'post-small', 'customize', 'explore'] as const;

  it('is locked with no state or an unfinished mission', () => {
    expect(badgeRewardView(undefined, now)).toBe('locked');
    expect(badgeRewardView(stateWith(['find-people']), now)).toBe('locked');
  });

  it('is ready once every task is done and nothing has been claimed', () => {
    expect(badgeRewardView(stateWith([...allDone]), now)).toBe('ready');
  });

  it('is claiming while a claim is genuinely in flight', () => {
    const state = stateWith([...allDone], {
      badgeClaim: {
        badge: 'ditto-explorer',
        status: 'claiming',
        claimingStartedAt: now - 1_000,
      },
    });
    expect(badgeRewardView(state, now)).toBe('claiming');
  });

  it('reports a stale in-flight claim as failed, not stuck claiming', () => {
    // The app died mid-publish. The user must be able to retry rather than
    // stare at a spinner that will never resolve.
    const state = stateWith([...allDone], {
      badgeClaim: {
        badge: 'ditto-explorer',
        status: 'claiming',
        claimingStartedAt: now - STALE_CLAIMING_TIMEOUT_MS - 1,
      },
    });
    expect(badgeRewardView(state, now)).toBe('failed');
  });

  it('reports an explicit failure as failed', () => {
    const state = stateWith([...allDone], {
      badgeClaim: { badge: 'ditto-explorer', status: 'failed', failedAt: now },
    });
    expect(badgeRewardView(state, now)).toBe('failed');
  });

  it('is claimed once the claim published, even if the mission was later dismissed', () => {
    const state = stateWith([...allDone], {
      status: 'skipped',
      badgeClaim: {
        badge: 'ditto-explorer',
        status: 'claimed',
        claimEventId: 'f'.repeat(64),
        claimedAt: now,
      },
    });
    // Dismissing must never appear to undo a published claim.
    expect(badgeRewardView(state, now)).toBe('claimed');
  });

  it('is dismissed when the mission was hidden before claiming', () => {
    const state = stateWith([...allDone], { status: 'skipped', skippedAt: now });
    expect(badgeRewardView(state, now)).toBe('dismissed');
  });
});

describe('hasMeaningfulProfile', () => {
  it('is false for missing, empty, or whitespace-only metadata', () => {
    expect(hasMeaningfulProfile(undefined)).toBe(false);
    expect(hasMeaningfulProfile({})).toBe(false);
    expect(hasMeaningfulProfile({ name: '   ' })).toBe(false);
  });

  it('is true for any one meaningful field', () => {
    expect(hasMeaningfulProfile({ name: 'Alice' })).toBe(true);
    expect(hasMeaningfulProfile({ about: 'hi' })).toBe(true);
    expect(hasMeaningfulProfile({ picture: 'https://example.com/a.png' })).toBe(true);
    expect(hasMeaningfulProfile({ display_name: 'Alice' })).toBe(true);
  });

  it('ignores fields that are not part of the meaningful set', () => {
    expect(hasMeaningfulProfile({ website: 'https://example.com' })).toBe(false);
  });
});

describe('isProfileTaskSatisfied', () => {
  const kind0 = (createdAtMs: number) =>
    makeEvent({ kind: 0, created_at: Math.floor(createdAtMs / 1000) });

  it('is false with no event', () => {
    expect(isProfileTaskSatisfied(undefined, { name: 'Alice' }, STARTED_AT)).toBe(false);
  });

  it('is false when the profile has no meaningful fields', () => {
    expect(isProfileTaskSatisfied(kind0(STARTED_AT + 60_000), {}, STARTED_AT)).toBe(false);
  });

  it('is true for a profile saved after the mission started', () => {
    expect(
      isProfileTaskSatisfied(kind0(STARTED_AT + 60_000), { name: 'Alice' }, STARTED_AT),
    ).toBe(true);
  });

  it('does not auto-complete from a profile that predates the mission', () => {
    // A user who already had a profile is asked to do something, not credited
    // for having already done it before the mission existed.
    expect(
      isProfileTaskSatisfied(kind0(STARTED_AT - 86_400_000), { name: 'Alice' }, STARTED_AT),
    ).toBe(false);
  });

  it('tolerates modest clock skew so a just-saved profile still counts', () => {
    const slightlyBehind = kind0(STARTED_AT - PUBLISH_CLOCK_SKEW_MS + 1_000);
    expect(isProfileTaskSatisfied(slightlyBehind, { name: 'Alice' }, STARTED_AT)).toBe(true);
  });
});

describe('isQualifyingStarterPost', () => {
  it('accepts a root kind-1 note by this user after the mission started', () => {
    expect(isQualifyingStarterPost(makeEvent(), PUBKEY, STARTED_AT)).toBe(true);
  });

  it('rejects a missing event or unknown pubkey', () => {
    expect(isQualifyingStarterPost(undefined, PUBKEY, STARTED_AT)).toBe(false);
    expect(isQualifyingStarterPost(makeEvent(), undefined, STARTED_AT)).toBe(false);
  });

  it('rejects a note authored by someone else', () => {
    expect(isQualifyingStarterPost(makeEvent(), OTHER_PUBKEY, STARTED_AT)).toBe(false);
  });

  it('rejects non-kind-1 events (polls, voice messages, articles)', () => {
    for (const kind of [1068, 1222, 1244, 30023, 6]) {
      expect(isQualifyingStarterPost(makeEvent({ kind }), PUBKEY, STARTED_AT)).toBe(false);
    }
  });

  it('rejects replies and comments — the task is to post, not to reply', () => {
    for (const tagName of ['e', 'E', 'a', 'A']) {
      const reply = makeEvent({ tags: [[tagName, 'd'.repeat(64), '', 'root']] });
      expect(isQualifyingStarterPost(reply, PUBKEY, STARTED_AT)).toBe(false);
    }
  });

  it('accepts a note carrying unrelated tags (hashtags, mentions)', () => {
    const tagged = makeEvent({ tags: [['t', 'ditto'], ['p', OTHER_PUBKEY]] });
    expect(isQualifyingStarterPost(tagged, PUBKEY, STARTED_AT)).toBe(true);
  });

  it('rejects a note published before the mission started', () => {
    const old = makeEvent({ created_at: Math.floor((STARTED_AT - 86_400_000) / 1000) });
    expect(isQualifyingStarterPost(old, PUBKEY, STARTED_AT)).toBe(false);
  });

  it('tolerates modest clock skew', () => {
    const skewed = makeEvent({
      created_at: Math.floor((STARTED_AT - PUBLISH_CLOCK_SKEW_MS + 1_000) / 1000),
    });
    expect(isQualifyingStarterPost(skewed, PUBKEY, STARTED_AT)).toBe(true);
  });
});

describe('themeSignature', () => {
  it('is stable for the same built-in theme', () => {
    expect(themeSignature('dark', undefined)).toBe(themeSignature('dark', undefined));
  });

  it('differs between built-in themes', () => {
    expect(themeSignature('dark', undefined)).not.toBe(themeSignature('light', undefined));
  });

  it('ignores a stored customTheme while a built-in theme is active', () => {
    // Switching away from custom and back must not look like a change on its
    // own; only the *active* theme matters.
    expect(themeSignature('light', { colors: { background: '#fff' } })).toBe(
      themeSignature('light', undefined),
    );
  });

  it('detects an edited custom palette as a change', () => {
    const before = themeSignature('custom', { colors: { background: '#000' } });
    const after = themeSignature('custom', { colors: { background: '#111' } });
    expect(before).not.toBe(after);
  });

  it('never throws on a circular custom theme', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => themeSignature('custom', circular)).not.toThrow();
    expect(themeSignature('custom', circular)).toBe('custom:unserializable');
  });
});
