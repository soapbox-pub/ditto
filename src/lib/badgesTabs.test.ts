import { describe, it, expect } from 'vitest';

import {
  BADGES_TABS,
  BADGES_TAB_PARAM,
  DITTO_EXPLORER_BADGES_DESTINATION,
  parseBadgesTab,
  resolveBadgesTab,
} from './badgesTabs';

/**
 * The half a navigation test cannot see.
 *
 * `RewardCeremony.test.tsx` asserts that both "Open Badges" actions navigate to
 * this URL. That is worth nothing on its own: a URL can be perfectly consistent
 * between two call sites and still encode a parameter the Badges page ignores.
 * So these run the destination back through the same parser the page uses, and
 * check it resolves to the My Badges tab.
 */

/** What `/badges` does with a URL: the page reads the parameter, then parses it. */
function tabFor(url: string) {
  return parseBadgesTab(new URLSearchParams(url.split('?')[1] ?? '').get(BADGES_TAB_PARAM));
}

describe('badges tabs', () => {
  it('sends the Ditto Explorer reward flow to My Badges', () => {
    expect(tabFor(DITTO_EXPLORER_BADGES_DESTINATION)).toBe('mine');
    expect(DITTO_EXPLORER_BADGES_DESTINATION.split('?')[0]).toBe('/badges');
  });

  it('travels as the stable identifier, never the visible label', () => {
    // "My Badges" is copy and may be reworded; `mine` is the contract.
    expect(DITTO_EXPLORER_BADGES_DESTINATION).not.toMatch(/my.?badges/i);
    expect(DITTO_EXPLORER_BADGES_DESTINATION).toBe(`/badges?${BADGES_TAB_PARAM}=mine`);
  });

  it('beats the session preference, which is what the bug was', () => {
    // The reward flow landed on Follows because that is where the session had
    // last been. The named tab has to win, or the link means nothing.
    const requested = new URLSearchParams(
      DITTO_EXPLORER_BADGES_DESTINATION.split('?')[1],
    ).get(BADGES_TAB_PARAM);

    expect(resolveBadgesTab(requested, 'follows')).toBe('mine');
    expect(resolveBadgesTab(requested, 'mine')).toBe('mine');
  });

  it('leaves an unrequested visit on its stored preference', () => {
    // `/badges` from the sidebar is untouched by any of this.
    expect(resolveBadgesTab(null, 'follows')).toBe('follows');
    expect(resolveBadgesTab(undefined, 'mine')).toBe('mine');
    expect(resolveBadgesTab('nonsense', 'follows')).toBe('follows');
  });

  it('ignores anything the page does not offer, leaving the stored default alone', () => {
    // A stray or stale parameter must not blank the page or invent a tab; the
    // page falls back to its session preference when this returns undefined.
    for (const raw of ['', 'MINE', 'awarded', 'undefined', null, undefined]) {
      expect(parseBadgesTab(raw)).toBeUndefined();
    }
    for (const tab of BADGES_TABS) {
      expect(parseBadgesTab(tab)).toBe(tab);
    }
  });
});
