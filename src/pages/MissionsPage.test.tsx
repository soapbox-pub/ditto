import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import type { ReactElement } from 'react';

import { MissionsPage } from './MissionsPage';
import { DITTO_EXPLORER_BADGE_IMAGE } from '@/lib/badgeClaim';
import {
  createInitialGuideState,
  introState as deriveIntroState,
  areAllPathsCompleted,
  badgeRewardView,
  canShowMissionDetail,
  isIntroOutstanding,
  nextRecommendedPath,
  type PostOnboardingGuideState,
} from '@/lib/postOnboardingGuide';

/**
 * `/missions` as a destination.
 *
 * These are about what the page *says* and how it is *structured* — the journey
 * entity, which mission is recommended, whether a guided flow is in flight, and
 * above all that the reward stays sealed. Layout is asserted only where it
 * carries meaning (two regions on desktop, one column below that); nothing here
 * pins pixels or class strings that the next visual pass would have to fight.
 */

let state: PostOnboardingGuideState | undefined;
let celebration: { celebrating: boolean; completedPath?: string } = { celebrating: false };
const claim = vi.fn();

vi.mock('@/hooks/usePostOnboardingGuide', () => ({
  usePostOnboardingGuide: () => ({
    state,
    isLoading: false,
    isActive: state?.status === 'active',
    isCompleted: state?.status === 'completed',
    isDismissed: state?.status === 'skipped',
    completedCount: state
      ? Object.values(state.paths).filter((p) => p === 'completed').length
      : 0,
    totalCount: 4,
    allCompleted: state ? areAllPathsCompleted(state) : false,
    rewardView: badgeRewardView(state),
    badgeClaim: state?.badgeClaim,
    introState: deriveIntroState(state),
    introOutstanding: isIntroOutstanding(state),
    canShowDetail: canShowMissionDetail(state),
    nextPath: nextRecommendedPath(state),
    interaction: state?.interact,
    resumeGuide: vi.fn(),
    resetGuideDev: vi.fn(),
    acknowledgeIntro: vi.fn(),
    postponeIntro: vi.fn(),
    markIntroPresented: vi.fn(),
    dismissGuide: vi.fn(),
  }),
}));
vi.mock('@/hooks/useMissionCelebration', () => ({
  useMissionCelebration: () => celebration,
}));
vi.mock('@/hooks/useBadgeClaim', () => ({
  useBadgeClaim: () => ({
    claim,
    rewardView: badgeRewardView(state),
    isClaiming: badgeRewardView(state) === 'claiming',
  }),
}));
vi.mock('@/hooks/useStartMissionTask', () => ({ useStartMissionTask: () => vi.fn() }));
vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ config: { appId: 'ditto', appName: 'Ditto' } }),
}));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { pubkey: 'a'.repeat(64) } }),
}));
vi.mock('@/hooks/useSeoMeta', () => ({ useSeoMeta: () => {} }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children?: React.ReactNode }) => <a href="/">{children}</a>,
}));

function render(ui: ReactElement) {
  return rtlRender(<IntlProvider locale="en">{ui}</IntlProvider>);
}

const ALL_DONE = {
  'find-people': 'completed',
  'post-small': 'completed',
  customize: 'completed',
  interact: 'completed',
} as const;

/** Acknowledged introduction by default: most states are about the journey. */
function seed(overrides: Partial<PostOnboardingGuideState> = {}) {
  state = { ...createInitialGuideState(1_000), intro: { acknowledgedAt: 2_000 }, ...overrides };
}

function missionRow(label: RegExp | string) {
  return screen.getByRole('button', { name: label });
}

beforeEach(() => {
  state = undefined;
  celebration = { celebrating: false };
  claim.mockClear();
});

describe('/missions — a destination, not a card', () => {
  it('frames itself as a home for journeys rather than as one mission', () => {
    seed();
    render(<MissionsPage />);

    expect(screen.getByText(/your journeys/i)).toBeInTheDocument();
    expect(screen.getByText(/small journeys that help you discover ditto/i)).toBeInTheDocument();
  });

  it('presents Ditto Explorer as a journey entity with its own progress', () => {
    seed({ paths: { ...ALL_DONE, customize: 'not_started', interact: 'not_started' } });
    const { container } = render(<MissionsPage />);

    const journey = container.querySelector('section[aria-label="Ditto Explorer"]');
    expect(journey).not.toBeNull();
    expect(within(journey as HTMLElement).getByText(/your first journey through ditto/i))
      .toBeInTheDocument();
    expect(within(journey as HTMLElement).getByText('2/4')).toBeInTheDocument();
    expect(
      within(journey as HTMLElement).getByRole('progressbar', {
        name: /2 of 4 missions complete/i,
      }),
    ).toBeInTheDocument();
  });

  it('is no longer a single card wrapping everything', () => {
    // The hero, the missions and the reward are separate regions now. The old
    // page nested all three inside one <Card>, which is what made it read as a
    // list view rather than a place.
    seed();
    const { container } = render(<MissionsPage />);

    const journey = container.querySelector('section[aria-label="Ditto Explorer"]')!;
    const missions = journey.querySelector('ol')!;
    const reward = screen.getByText('Special reward');
    expect(missions.contains(reward)).toBe(false);
  });

  it('labels the journey only when the label says something new', () => {
    // Underway needs no chip: the count and the bar already say 1/4. The states
    // the progress cannot express do get one.
    seed({ paths: { ...ALL_DONE, 'post-small': 'not_started', customize: 'not_started', interact: 'not_started' } });
    const { unmount } = render(<MissionsPage />);
    expect(screen.queryByText('Not started')).toBeNull();
    expect(screen.getByText('1/4')).toBeInTheDocument();
    unmount();

    seed({ intro: {} });
    const second = render(<MissionsPage />);
    expect(screen.getByText('Not started')).toBeInTheDocument();
    second.unmount();

    seed({ paths: { ...ALL_DONE }, status: 'completed' });
    render(<MissionsPage />);
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });
});

describe('/missions — mission list', () => {
  it('surfaces the recommended mission as a suggestion', () => {
    seed({ paths: { ...ALL_DONE, customize: 'not_started', interact: 'not_started' } });
    render(<MissionsPage />);

    // `nextRecommendedPath` picks the first unfinished mission in order.
    expect(within(missionRow(/make it feel like me/i)).getByText('Next up')).toBeInTheDocument();
    // …and only that one, so nothing implies the rest are blocked.
    expect(screen.getAllByText('Next up')).toHaveLength(1);
    expect(within(missionRow(/find something you like/i)).queryByText('Next up')).toBeNull();
  });

  it('leaves every unfinished mission startable, in any order', () => {
    seed({ paths: { ...ALL_DONE, customize: 'not_started', interact: 'not_started' } });
    render(<MissionsPage />);

    expect(missionRow(/make it feel like me/i)).toBeEnabled();
    expect(missionRow(/find something you like/i)).toBeEnabled();
  });

  it('distinguishes a launched mission from a recommended one', () => {
    // `startPath` writes both halves, so a genuinely in-flight guided flow has
    // `activePath` *and* that mission marked active.
    seed({
      paths: { ...ALL_DONE, 'post-small': 'active', customize: 'not_started', interact: 'not_started' },
      activePath: 'post-small',
    });
    render(<MissionsPage />);

    const row = missionRow(/post something small/i);
    expect(within(row).getByText('In progress')).toBeInTheDocument();
    expect(within(row).getByText('Continue')).toBeInTheDocument();
    // No competing recommendation while something is actually in flight.
    expect(screen.queryByText('Next up')).toBeNull();
  });

  it('ignores an activePath the user never actually launched', () => {
    seed({
      paths: { ...ALL_DONE, 'post-small': 'not_started', customize: 'not_started', interact: 'not_started' },
      activePath: 'post-small',
    });
    render(<MissionsPage />);

    expect(screen.queryByText('In progress')).toBeNull();
    expect(screen.getAllByText('Next up')).toHaveLength(1);
  });

  it('keeps completed missions readable rather than striking them out', () => {
    seed({ paths: { ...ALL_DONE, interact: 'not_started' } });
    render(<MissionsPage />);

    const row = missionRow(/find your people/i);
    // Stated in words, not by colour or a tick alone.
    expect(within(row).getByText('Completed')).toBeInTheDocument();
    expect(row.className).not.toMatch(/line-through/);
    // Three finished missions must not read as a wall of dead controls: the
    // label keeps full contrast.
    expect(within(row).getByText('Find your people').className).toContain('text-foreground');
  });

  it('says back what actually completed the interaction mission', () => {
    seed({
      paths: { ...ALL_DONE },
      status: 'completed',
      interact: { action: 'repost', completedAt: 5_000 },
    });
    render(<MissionsPage />);
    expect(screen.getByText('You shared a post.')).toBeInTheDocument();
  });
});

describe('/missions — the reward stays sealed', () => {
  /** Every image the page renders, from every state. */
  function renderedImageSources(container: HTMLElement) {
    return Array.from(container.querySelectorAll('img')).map((img) => img.getAttribute('src'));
  }

  it('never renders the real badge artwork while the journey is unfinished', () => {
    for (const paths of [
      { ...ALL_DONE, 'find-people': 'not_started', 'post-small': 'not_started', customize: 'not_started', interact: 'not_started' },
      { ...ALL_DONE, interact: 'not_started' },
    ] as const) {
      seed({ paths });
      const { container, unmount } = render(<MissionsPage />);
      expect(renderedImageSources(container)).not.toContain(DITTO_EXPLORER_BADGE_IMAGE);
      unmount();
    }
  });

  it('does not reveal the reward even once the journey is complete', () => {
    // The reveal experience does not exist yet, so 4/4 must not quietly become
    // the reveal by showing the artwork early.
    for (const badgeClaim of [
      undefined,
      { badge: 'ditto-explorer', status: 'claiming', claimingStartedAt: Date.now() },
      { badge: 'ditto-explorer', status: 'claimed', claimEventId: 'x', claimedAt: 1 },
      { badge: 'ditto-explorer', status: 'failed', failedAt: 1 },
    ] as const) {
      seed({ paths: { ...ALL_DONE }, status: 'completed', badgeClaim });
      const { container, unmount } = render(<MissionsPage />);
      expect(renderedImageSources(container)).not.toContain(DITTO_EXPLORER_BADGE_IMAGE);
      unmount();
    }
  });

  it('states the locked reward in words, not only by desaturation', () => {
    seed({ paths: { ...ALL_DONE, interact: 'not_started' } });
    render(<MissionsPage />);

    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.getByText(/complete your journey to reveal it/i)).toBeInTheDocument();
    expect(screen.getByText(/3 of 4 missions complete/i)).toBeInTheDocument();
  });

  it('offers no claim action while the reward is locked', () => {
    seed({ paths: { ...ALL_DONE, interact: 'not_started' } });
    render(<MissionsPage />);
    expect(screen.queryByRole('button', { name: /claim/i })).toBeNull();
  });

  it('keeps the reward out of the mission list', () => {
    seed({ paths: { ...ALL_DONE, interact: 'not_started' } });
    const { container } = render(<MissionsPage />);
    const missions = container.querySelector('ol')!;
    expect(within(missions).queryByText('Special reward')).toBeNull();
  });
});

describe('/missions — claim lifecycle', () => {
  it('reads as ready, distinctly from locked, at 4/4', () => {
    seed({ paths: { ...ALL_DONE }, status: 'completed' });
    render(<MissionsPage />);

    expect(screen.getByText('Journey complete')).toBeInTheDocument();
    expect(screen.getByText(/your special reward is ready/i)).toBeInTheDocument();
    expect(screen.queryByText('Locked')).toBeNull();
    expect(screen.getByRole('button', { name: /claim reward/i })).toBeEnabled();
  });

  it('disables the action while a claim is in flight', () => {
    seed({
      paths: { ...ALL_DONE },
      status: 'completed',
      badgeClaim: { badge: 'ditto-explorer', status: 'claiming', claimingStartedAt: Date.now() },
    });
    render(<MissionsPage />);

    expect(screen.getByRole('button', { name: /claiming/i })).toBeDisabled();
  });

  it('offers a retry after a failed claim, without losing progress', () => {
    seed({
      paths: { ...ALL_DONE },
      status: 'completed',
      badgeClaim: { badge: 'ditto-explorer', status: 'failed', failedAt: 1 },
    });
    render(<MissionsPage />);

    expect(screen.getByText(/nothing was lost/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeEnabled();
  });

  it('does not promise a notification once the claim is submitted', () => {
    // The issuer is a server Ditto does not control and which is currently
    // inactive, so "you'll be notified" was a promise this client cannot keep.
    seed({
      paths: { ...ALL_DONE },
      status: 'completed',
      badgeClaim: { badge: 'ditto-explorer', status: 'claimed', claimEventId: 'x', claimedAt: 1 },
    });
    render(<MissionsPage />);

    expect(screen.getByText('Badge claim submitted')).toBeInTheDocument();
    expect(screen.getByText(/appear in badges once it has been issued/i)).toBeInTheDocument();
    expect(screen.queryByText(/notified/i)).toBeNull();
    expect(screen.queryByText(/award pending/i)).toBeNull();
  });

  it('stays a usable page after the claim', () => {
    seed({
      paths: { ...ALL_DONE },
      status: 'completed',
      interact: { action: 'reaction', completedAt: 5_000 },
      badgeClaim: { badge: 'ditto-explorer', status: 'claimed', claimEventId: 'x', claimedAt: 1 },
    });
    const { container } = render(<MissionsPage />);

    // The journey is still here, still legible, and still leads somewhere.
    expect(screen.getByText(/your first journey through ditto/i)).toBeInTheDocument();
    expect(container.querySelectorAll('ol > li')).toHaveLength(4);
    expect(screen.getByRole('button', { name: /open badges/i })).toBeEnabled();
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });
});

describe('/missions — the 4/4 moment', () => {
  /** 4/4 has just landed on this page, and the celebration is playing. */
  function seedCelebrating() {
    celebration = { celebrating: true, completedPath: 'interact' };
    seed({
      paths: { ...ALL_DONE },
      status: 'completed',
      interact: { action: 'reaction', completedAt: 5_000 },
    });
  }

  it('celebrates on the journey itself, with the count still reading 4/4', () => {
    // The engine drives this in the real app (see `useMissionCelebration`); the
    // page's job is to put it somewhere it can be seen, and to keep showing the
    // count it has just reached rather than swapping straight to the reward.
    seedCelebrating();
    const { container } = render(<MissionsPage />);

    expect(container.querySelector('.mission-celebrate')).not.toBeNull();
    expect(screen.getByText('4/4')).toBeInTheDocument();
    expect(screen.getByText('You reacted to a post.')).toBeInTheDocument();
  });

  it('keeps the reward sealed and actionless while the celebration plays', () => {
    // The fourth task lands 4/4 and an earned reward in one write, so the
    // reward used to start asking for attention on top of the moment that
    // produced it. It acknowledges the completion and waits.
    seedCelebrating();
    render(<MissionsPage />);

    expect(screen.getByText('Journey complete')).toBeInTheDocument();
    expect(screen.queryByText(/your special reward is ready/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /claim reward/i })).toBeNull();
    expect(screen.queryByText('Locked')).toBeNull();
  });

  it('keeps the reward glow off until the celebration is over', () => {
    seedCelebrating();
    const { container, unmount } = render(<MissionsPage />);
    // No overlap: the completion ring and the reward halo never run together.
    expect(container.querySelector('.mission-celebrate')).not.toBeNull();
    expect(container.querySelector('.mission-reward-glow')).toBeNull();
    unmount();

    celebration = { celebrating: false };
    const settled = render(<MissionsPage />);
    expect(settled.container.querySelector('.mission-celebrate')).toBeNull();
    expect(settled.container.querySelector('.mission-reward-glow')).not.toBeNull();
  });

  it('resolves to the ready reward once the celebration ends', () => {
    seedCelebrating();
    const { unmount } = render(<MissionsPage />);
    unmount();

    celebration = { celebrating: false };
    render(<MissionsPage />);

    expect(screen.getByText('Journey complete')).toBeInTheDocument();
    expect(screen.getByText(/your special reward is ready/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /claim reward/i })).toBeEnabled();
  });

  it('offers the reward immediately to someone who finished elsewhere', () => {
    // The common path: the fourth task completes on the feed, so this page
    // never sees the count change and must not invent a settle to sit through.
    celebration = { celebrating: false };
    seed({ paths: { ...ALL_DONE }, status: 'completed' });
    render(<MissionsPage />);

    expect(screen.getByRole('button', { name: /claim reward/i })).toBeEnabled();
  });

  it('keeps the count on screen once the journey is finished', () => {
    // A compact surface trades `4/4` for the reward framing because it has room
    // for one of them. A page has room for both, and the count is the
    // achievement.
    seed({ paths: { ...ALL_DONE }, status: 'completed' });
    render(<MissionsPage />);
    expect(screen.getByText('4/4')).toBeInTheDocument();
  });
});

describe('/missions — layout', () => {
  it('gives the missions and the reward their own regions, missions wider', () => {
    seed({ paths: { ...ALL_DONE, interact: 'not_started' } });
    const { container } = render(<MissionsPage />);

    const grid = container.querySelector('.grid')!;
    // Two columns from `lg` up, one below it: no separate mobile branch, and
    // the mission column takes the larger fraction.
    expect(grid.className).toContain('lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]');
    expect(grid.children).toHaveLength(2);
  });

  it('collapses to a single column when there is no reward to show', () => {
    // A hidden journey has no reward panel, so the grid must not leave a gap
    // where one would have been.
    seed({ status: 'skipped', skippedAt: 3_000 });
    const { container } = render(<MissionsPage />);

    const grid = container.querySelector('.grid')!;
    expect(grid.className).not.toContain('lg:grid-cols-');
    expect(grid.children).toHaveLength(1);
  });

  it('shows the introduction instead of mission rows while it is owed', () => {
    seed({ intro: {} });
    const { container } = render(<MissionsPage />);

    expect(screen.getByRole('button', { name: /start exploring/i })).toBeInTheDocument();
    expect(container.querySelector('ol')).toBeNull();
  });
});
