import { describe, it, expect, afterEach, vi } from 'vitest';

import {
  MISSION_DEV_FAKE_CLAIM_EVENT_ID,
  missionDevActive,
  missionDevCeremonyEntry,
  missionDevFakePublish,
  missionDevState,
  readMissionDevState,
} from './missionHarness';
import { BADGE_CLAIM_KIND, buildExplorerClaimTemplate } from '@/lib/badgeClaim';
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
      'ceremony-revealing': 'revealing',
      'ceremony-revealed': 'revealed',
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

  it('stands in for the signer and the relay, and for nothing else', async () => {
    // Without this the success path could not be exercised at all: the harness
    // has no account, so the real claim stopped at its first guard. This fakes
    // exactly one step — the publish — so everything around it stays the
    // production path.
    harness('?missionDev=ready');
    const publish = missionDevFakePublish();
    expect(publish).toBeDefined();

    const template = buildExplorerClaimTemplate(['find-people', 'post-small']);
    const event = await publish!(template);

    // A plain object built here: nothing signed it, and nothing sent it.
    expect(event.id).toBe(MISSION_DEV_FAKE_CLAIM_EVENT_ID);
    expect(event.kind).toBe(BADGE_CLAIM_KIND);
    expect(event.tags).toEqual(template.tags);
    // Obviously not a real signature or a real author.
    expect(event.sig).toMatch(/^0+$/);
    expect(event.id).toMatch(/^dev0/);
  });

  it('offers no publisher at all outside the harness', () => {
    vi.stubGlobal('location', { ...window.location, search: '', hostname: 'localhost' } as Location);
    expect(missionDevFakePublish()).toBeUndefined();

    vi.stubGlobal('location', {
      ...window.location,
      search: '?missionDev=ready',
      hostname: 'ditto.pub',
    } as Location);
    expect(missionDevFakePublish()).toBeUndefined();
  });

  it('can run its fake claim over and over', async () => {
    // The point of the harness: repeat the flow without leaving anything behind.
    harness('?missionDev=ready');
    const publish = missionDevFakePublish()!;
    const template = buildExplorerClaimTemplate(['find-people']);

    const first = await publish(template);
    const second = await publish(template);
    expect(first.id).toBe(second.id);
    // The scenario state is rebuilt from the query parameter, so nothing the
    // fake claim did has accumulated in it.
    expect(readMissionDevState()?.badgeClaim).toBeUndefined();
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
