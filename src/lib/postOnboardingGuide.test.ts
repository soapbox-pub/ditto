import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  POST_ONBOARDING_PATHS,
  POST_ONBOARDING_PATH_IDS,
  PUBLISH_CLOCK_SKEW_MS,
  STALE_CLAIMING_TIMEOUT_MS,
  areAllPathsCompleted,
  badgeRewardView,
  countCompletedPaths,
  createInitialGuideState,
  hasMeaningfulProfile,
  interactionSuccessMessage,
  isCeremonyOwed,
  isClaimInFlight,
  isProfileTaskSatisfied,
  isQualifyingStarterPost,
  nextRecommendedPath,
  rewardPresentation,
  themeSignature,
  type PostOnboardingBadgeClaim,
  type PostOnboardingGuideState,
} from './postOnboardingGuide';

const PUBKEY = 'a'.repeat(64);
const OTHER_PUBKEY = 'b'.repeat(64);
const STARTED_AT = 1_700_000_000_000;

/** Mission state with an arbitrary set of tasks marked complete. */
function stateWith(
  completed: Array<'find-people' | 'post-small' | 'customize' | 'interact'>,
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
    expect(countCompletedPaths(stateWith(['find-people', 'interact']))).toBe(2);
  });

  it('reports all-complete only when every task is done', () => {
    expect(areAllPathsCompleted(stateWith(['find-people', 'post-small', 'customize']))).toBe(false);
    expect(
      areAllPathsCompleted(stateWith(['find-people', 'post-small', 'customize', 'interact'])),
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
  const allDone = ['find-people', 'post-small', 'customize', 'interact'] as const;

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

  it('separates a submitted claim from a revealed reward', () => {
    // Two different facts. This branch shipped claiming before any reveal
    // existed, so a claim with no `revealedAt` is still owed one.
    const claimed = stateWith([...allDone], {
      badgeClaim: {
        badge: 'ditto-explorer',
        status: 'claimed',
        claimEventId: 'f'.repeat(64),
        claimedAt: now,
      },
    });
    expect(badgeRewardView(claimed, now)).toBe('claimed');

    const revealed = stateWith([...allDone], {
      badgeClaim: {
        badge: 'ditto-explorer',
        status: 'claimed',
        claimEventId: 'f'.repeat(64),
        claimedAt: now,
        revealedAt: now + 1_000,
      },
    });
    expect(badgeRewardView(revealed, now)).toBe('revealed');
  });

  it('keeps a revealed reward revealed after the mission is hidden', () => {
    const state = stateWith([...allDone], {
      status: 'skipped',
      skippedAt: now,
      badgeClaim: {
        badge: 'ditto-explorer',
        status: 'claimed',
        claimEventId: 'f'.repeat(64),
        claimedAt: now,
        revealedAt: now,
      },
    });
    // Same precedence as `claimed`: hiding undoes neither the claim nor the
    // reveal.
    expect(badgeRewardView(state, now)).toBe('revealed');
  });

  it('ignores a reveal stamp on a claim that never succeeded', () => {
    const state = stateWith([...allDone], {
      badgeClaim: { badge: 'ditto-explorer', status: 'failed', failedAt: now, revealedAt: now },
    });
    expect(badgeRewardView(state, now)).toBe('failed');
  });
});

describe('isCeremonyOwed', () => {
  const now = 1_700_000_000_000;
  const allDone = ['find-people', 'post-small', 'customize', 'interact'] as const;

  it('is false before the journey is finished', () => {
    expect(isCeremonyOwed(undefined, now)).toBe(false);
    expect(isCeremonyOwed(stateWith(['find-people', 'post-small']), now)).toBe(false);
  });

  it('is true for every state between finishing and revealing', () => {
    const cases: Array<PostOnboardingBadgeClaim | undefined> = [
      undefined,
      { badge: 'ditto-explorer', status: 'claiming', claimingStartedAt: now },
      { badge: 'ditto-explorer', status: 'failed', failedAt: now },
      { badge: 'ditto-explorer', status: 'claimed', claimEventId: 'f'.repeat(64), claimedAt: now },
    ];
    for (const badgeClaim of cases) {
      expect(isCeremonyOwed(stateWith([...allDone], { badgeClaim }), now)).toBe(true);
    }
  });

  it('is false once the reward has been revealed', () => {
    const state = stateWith([...allDone], {
      badgeClaim: {
        badge: 'ditto-explorer',
        status: 'claimed',
        claimEventId: 'f'.repeat(64),
        claimedAt: now,
        revealedAt: now,
      },
    });
    expect(isCeremonyOwed(state, now)).toBe(false);
  });

  it('is false for a mission the user deliberately hid', () => {
    const state = stateWith([...allDone], { status: 'skipped', skippedAt: now });
    expect(isCeremonyOwed(state, now)).toBe(false);
  });

  it('inherits stale-claim recovery rather than restating it', () => {
    const state = stateWith([...allDone], {
      badgeClaim: {
        badge: 'ditto-explorer',
        status: 'claiming',
        claimingStartedAt: now - STALE_CLAIMING_TIMEOUT_MS - 1,
      },
    });
    expect(badgeRewardView(state, now)).toBe('failed');
    expect(isCeremonyOwed(state, now)).toBe(true);
  });
});

describe('rewardPresentation', () => {
  it('holds a ready reward back through the completion celebration', () => {
    expect(rewardPresentation('ready', true)).toBe('settling');
    expect(rewardPresentation('ready', false)).toBe('ready');
  });

  it('leaves every other state exactly as it is', () => {
    // Nothing else is reachable at the moment a count increases, and nothing
    // else has attention to hold back.
    for (const view of ['locked', 'claiming', 'claimed', 'revealed', 'failed', 'dismissed'] as const) {
      expect(rewardPresentation(view, true)).toBe(view);
      expect(rewardPresentation(view, false)).toBe(view);
    }
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

// ── The fourth task ─────────────────────────────────────────────────────────

describe('the mission’s four tasks', () => {
  it('ends on interaction rather than on navigating around the product', () => {
    // The journey the four tasks describe: find people → publish something →
    // make it yours → engage with someone. The retired fourth task ("Explore
    // Ditto", completed by visiting Trends) named none of those things.
    expect(POST_ONBOARDING_PATH_IDS).toEqual([
      'find-people',
      'post-small',
      'customize',
      'interact',
    ]);
    expect(POST_ONBOARDING_PATH_IDS).not.toContain('explore');
  });

  it('uses the new title and copy, and none of the retired task’s', () => {
    const meta = POST_ONBOARDING_PATHS.interact;
    expect(meta.label).toBe('Find something you like');
    expect(meta.description).toBe('React, reply, repost, or save a post from someone else.');

    const copy = Object.values(POST_ONBOARDING_PATHS)
      .flatMap((m) => [m.label, m.description, m.completionHint])
      .join(' ');
    expect(copy).not.toMatch(/Explore Ditto/);
    expect(copy).not.toMatch(/Trends/);
  });

  it('does not call itself "join a conversation" — it supports more than replies', () => {
    expect(POST_ONBOARDING_PATHS.interact.label.toLowerCase()).not.toContain('conversation');
  });

  it('leaves the first three tasks exactly as they were', () => {
    expect(POST_ONBOARDING_PATHS['find-people']).toMatchObject({
      label: 'Find your people',
      description: 'Follow voices that make your feed feel alive.',
      completionHint: 'Follow someone new to complete this.',
    });
    expect(POST_ONBOARDING_PATHS['post-small']).toMatchObject({
      label: 'Post something small',
      description: 'Say hi, ask a question, or share a thought.',
      completionHint: 'Publish a post to complete this.',
    });
    expect(POST_ONBOARDING_PATHS.customize).toMatchObject({
      label: 'Make it feel like me',
      description: 'Add your profile and pick a theme.',
      completionHint: 'Save your profile, then choose a theme.',
    });
  });

  it('is binary — one interaction, not four boxes to tick', () => {
    const state = createInitialGuideState(STARTED_AT);
    expect(state.paths.interact).toBe('not_started');
    state.paths.interact = 'completed';
    expect(countCompletedPaths(state)).toBe(1);
  });
});

describe('interactionSuccessMessage', () => {
  it('names the action the user actually took', () => {
    expect(interactionSuccessMessage('reaction')).toBe('You reacted to a post.');
    expect(interactionSuccessMessage('reply')).toBe('You joined the conversation.');
    expect(interactionSuccessMessage('repost')).toBe('You shared a post.');
    expect(interactionSuccessMessage('bookmark')).toBe('You saved something for later.');
  });
});

// ── Resilience to states this build did not write ───────────────────────────

describe('unknown task ids', () => {
  it('survives an unknown activePath from a newer client', () => {
    const state = {
      ...createInitialGuideState(STARTED_AT),
      activePath: 'something-new',
    } as unknown as PostOnboardingGuideState;
    expect(() => nextRecommendedPath(state)).not.toThrow();
    expect(nextRecommendedPath(state)).toBe('find-people');
  });

  it('has no recommendation when there is no mission', () => {
    expect(nextRecommendedPath(undefined)).toBeUndefined();
  });
});
