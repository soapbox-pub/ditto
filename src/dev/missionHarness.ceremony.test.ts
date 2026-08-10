import { describe, it, expect, afterEach, vi } from 'vitest';

import {
  missionDevActive,
  missionDevCeremonyEntry,
  missionDevState,
  readMissionDevState,
} from './missionHarness';
import { areAllPathsCompleted, badgeRewardView, isCeremonyOwed } from '@/lib/postOnboardingGuide';

/**
 * The harness exists so the reward ceremony can be opened and closed a hundred
 * times without following anyone, posting anything, or finishing a journey — and
 * the whole value of that is lost if it can quietly do any of those things.
 *
 * So these are less about the scenarios working than about what they are
 * incapable of: no publish path, no settings write, no real account, and nothing
 * at all outside localhost.
 */

function harness(search: string) {
  vi.stubGlobal('location', {
    ...window.location,
    search,
    hostname: 'localhost',
  } as Location);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mission harness — reward ceremony scenarios', () => {
  it('puts the journey straight into the 4/4 reward-ready state', () => {
    // The point of the whole harness: reaching this state for real means
    // following someone, publishing a post, editing a profile and a theme, and
    // interacting with somebody else's note.
    harness('?missionDev=ready');
    const state = readMissionDevState();

    expect(state).toBeDefined();
    expect(areAllPathsCompleted(state!)).toBe(true);
    expect(badgeRewardView(state!)).toBe('ready');
    expect(isCeremonyOwed(state!)).toBe(true);
  });

  it('opens the ceremony with its entrance, or straight on the settled stage', () => {
    harness('?missionDev=ceremony-opening');
    expect(missionDevCeremonyEntry()).toBe('opening');
    expect(isCeremonyOwed(readMissionDevState()!)).toBe(true);

    harness('?missionDev=ceremony-sealed');
    expect(missionDevCeremonyEntry()).toBe('sealed');
    expect(isCeremonyOwed(readMissionDevState()!)).toBe(true);
  });

  it('renders each ceremony phase directly, without acting', () => {
    // The point of these: inspect acting, the slow-signer copy, failure and the
    // submitted bridge without a signer, a relay, or a claim being attempted.
    const phases = {
      'ceremony-acting': 'acting',
      'ceremony-slow': 'slow',
      'ceremony-failed': 'failed',
      'ceremony-submitted': 'submitted',
    } as const;

    for (const [scenario, entry] of Object.entries(phases)) {
      harness(`?missionDev=${scenario}`);
      expect(missionDevCeremonyEntry()).toBe(entry);
      // The backing state is untouched 4/4-ready in every one of them: none of
      // these scenarios can express a claim, so none can have made one.
      const state = readMissionDevState()!;
      expect(badgeRewardView(state)).toBe('ready');
      expect(state.badgeClaim).toBeUndefined();
    }
  });

  it('asks for no ceremony from any other scenario', () => {
    for (const scenario of ['ready', 'claimed', 'revealed', 'active3', 'intro']) {
      harness(`?missionDev=${scenario}`);
      expect(missionDevCeremonyEntry()).toBeUndefined();
    }
  });

  it('never reaches the reveal, only the door to it', () => {
    // A ceremony scenario is the ready state plus "open the stage". It cannot
    // express a claim or a reveal, so there is no arrangement of query
    // parameters that fakes either.
    for (const scenario of ['ceremony-opening', 'ceremony-sealed']) {
      harness(`?missionDev=${scenario}`);
      const state = readMissionDevState()!;
      expect(state.badgeClaim).toBeUndefined();
      expect(badgeRewardView(state)).toBe('ready');
    }
  });

  it('produces state that is local only, and never a settings write', () => {
    // The state is substituted for *reading* and never persisted: the
    // encrypted-settings mutation is only reachable through
    // `usePostOnboardingGuide`, which routes every write into this in-memory
    // store instead. One shared object on purpose, so every mission surface sees
    // a transition at the same moment — exactly as they would through the real
    // query cache.
    harness('?missionDev=ceremony-sealed');
    const state = readMissionDevState()!;

    expect(readMissionDevState()).toBe(state);
    // No signer, no pubkey, no claim event: nothing here could be published, and
    // nothing carries an identity that a relay would accept.
    expect(JSON.stringify(state)).not.toContain('claimEventId');
    expect(JSON.stringify(state)).not.toContain('revealedAt');
  });

  it('is inert off localhost, whatever the query string says', () => {
    vi.stubGlobal('location', {
      ...window.location,
      search: '?missionDev=ceremony-sealed',
      hostname: 'ditto.pub',
    } as Location);

    expect(missionDevState()).toBeUndefined();
    expect(missionDevActive()).toBe(false);
    expect(missionDevCeremonyEntry()).toBeUndefined();
    expect(readMissionDevState()).toBeUndefined();
  });
});
