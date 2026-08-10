import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import type { ReactElement } from 'react';

import { MissionsWidget } from './MissionsWidget';
import { MobileMissionTeaser } from './MobileMissionTeaser';
import {
  badgeRewardView,
  createInitialGuideState,
  introState as deriveIntroState,
  isIntroOutstanding,
  nextRecommendedPath,
  type PostOnboardingGuideState,
} from '@/lib/postOnboardingGuide';

/**
 * Responsive-surface contract for the sidebar-first direction.
 *
 * Desktop shows the mission in the right sidebar on every page including Home;
 * mobile shows a compact in-flow teaser and delegates detail to `/missions`.
 * These pin the rules that keep that from degenerating into several prompts
 * competing for attention, or into a mission that vanishes on some routes.
 */

let state: PostOnboardingGuideState | undefined;
let celebration: { celebrating: boolean; completedPath?: string } = { celebrating: false };

vi.mock('@/hooks/usePostOnboardingGuide', () => ({
  usePostOnboardingGuide: () => ({
    state,
    isActive: state?.status === 'active',
    isCompleted: state?.status === 'completed',
    isDismissed: state?.status === 'skipped',
    completedCount: state
      ? Object.values(state.paths).filter((p) => p === 'completed').length
      : 0,
    totalCount: 4,
    rewardView: badgeRewardView(state),
    badgeClaim: state?.badgeClaim,
    introState: deriveIntroState(state),
    introOutstanding: isIntroOutstanding(state),
    nextPath: nextRecommendedPath(state),
    interaction: state?.interact,
    dismissGuide: vi.fn(),
    acknowledgeIntro: vi.fn(),
    postponeIntro: vi.fn(),
    markIntroPresented: vi.fn(),
  }),
}));
vi.mock('@/hooks/useMissionCelebration', () => ({
  useMissionCelebration: () => celebration,
}));
vi.mock('@/hooks/useStartMissionTask', () => ({
  useStartMissionTask: () => vi.fn(),
}));
vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ config: { appId: 'ditto' } }),
}));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { pubkey: 'a'.repeat(64) } }),
}));
const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

/** These surfaces use `FormattedMessage`, so they need an intl ancestor. */
function render(ui: ReactElement) {
  return rtlRender(<IntlProvider locale="en">{ui}</IntlProvider>);
}

const ALL_DONE = {
  'find-people': 'completed',
  'post-small': 'completed',
  customize: 'completed',
  interact: 'completed',
} as const;

/** Acknowledged intro by default — most scenarios are about the active mission. */
function seed(overrides: Partial<PostOnboardingGuideState> = {}) {
  const base = createInitialGuideState(1_000);
  state = { ...base, intro: { acknowledgedAt: 2_000 }, ...overrides };
}

describe('desktop sidebar widget', () => {
  beforeEach(() => {
    state = undefined;
    celebration = { celebrating: false };
  });

  it('renders nothing before the mission exists', () => {
    expect(render(<MissionsWidget />).container).toBeEmptyDOMElement();
  });

  it('renders on every page, including Home', () => {
    // The widget itself carries no route rule — suppression lives in
    // WidgetSidebar and now names only /missions. Previously `/` and `/feed`
    // were suppressed on the assumption that `/` means "feed", which left
    // anyone with a different homepage with no desktop surface at all.
    seed();
    render(<MissionsWidget />);
    expect(screen.getByText('Ditto Explorer')).toBeInTheDocument();
  });

  it('shows the recommended next step, not just the first unfinished task', () => {
    seed({ activePath: 'customize' });
    render(<MissionsWidget />);
    expect(screen.getByText(/Make it feel like me/)).toBeInTheDocument();
  });

  it('offers one primary action and a way to hide the mission', () => {
    seed();
    render(<MissionsWidget />);
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hide/i })).toBeInTheDocument();
  });

  it('does not put a four-task checklist in the sidebar', () => {
    seed();
    render(<MissionsWidget />);
    // Only the recommended step is named; the other tasks stay on /missions.
    expect(screen.queryByText('Post something small')).not.toBeInTheDocument();
    expect(screen.queryByText(/Find something you like/)).not.toBeInTheDocument();
  });

  it('recommends the interaction task, and never the retired Explore Ditto one', () => {
    seed({
      paths: {
        'find-people': 'completed',
        'post-small': 'completed',
        customize: 'completed',
        interact: 'not_started',
      },
    });
    render(<MissionsWidget />);
    expect(screen.getByText(/Find something you like/)).toBeInTheDocument();
    expect(screen.queryByText(/Explore Ditto/)).not.toBeInTheDocument();
    expect(screen.queryByText(/See what’s happening across Ditto/)).not.toBeInTheDocument();
  });

  it('acknowledges the exact action that completed the interaction task', () => {
    // Not a generic "task complete": the card says back what the user did.
    celebration = { celebrating: true, completedPath: 'interact' };
    seed({
      paths: {
        'find-people': 'completed',
        'post-small': 'completed',
        customize: 'completed',
        interact: 'completed',
      },
      interact: { action: 'repost', completedAt: 4_000 },
    });
    render(<MissionsWidget />);
    expect(screen.getByText('You shared a post.')).toBeInTheDocument();
  });

  it('does not replay the interaction acknowledgement for a different task', () => {
    celebration = { celebrating: true, completedPath: 'find-people' };
    seed({
      paths: {
        'find-people': 'completed',
        'post-small': 'not_started',
        customize: 'not_started',
        interact: 'completed',
      },
      interact: { action: 'repost', completedAt: 4_000 },
    });
    render(<MissionsWidget />);
    expect(screen.queryByText('You shared a post.')).not.toBeInTheDocument();
  });

  it('shows the introduction while it is pending', () => {
    seed({ intro: {} });
    render(<MissionsWidget />);
    expect(screen.getByText(/Your first journey through Ditto is ready/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start exploring/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /maybe later/i })).toBeInTheDocument();
  });

  it('falls through to the compact summary once the intro is postponed', () => {
    seed({ intro: { postponedAt: 3_000 } });
    render(<MissionsWidget />);
    expect(screen.queryByRole('button', { name: /start exploring/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('disappears when the mission is hidden', () => {
    seed({ status: 'skipped', skippedAt: 3_000 });
    expect(render(<MissionsWidget />).container).toBeEmptyDOMElement();
  });

  it('reframes as a reward prompt once the reward is unlocked', () => {
    seed({ status: 'completed', paths: { ...ALL_DONE } });
    render(<MissionsWidget />);
    expect(screen.getByRole('button', { name: /open reward/i })).toBeInTheDocument();
  });

  it('disappears once the reward has been revealed', () => {
    seed({
      status: 'completed',
      paths: { ...ALL_DONE },
      badgeClaim: {
        badge: 'ditto-explorer',
        status: 'claimed',
        claimEventId: 'f'.repeat(64),
        revealedAt: 9_000,
      },
    });
    expect(render(<MissionsWidget />).container).toBeEmptyDOMElement();
  });

  it('stays reachable while the claim is in but the reward is not revealed', () => {
    // Claiming used to be the end of the journey, and this surface vanished on
    // it. The reveal is a separate fact now, and this branch already shipped
    // claiming without one — so the route back must survive the claim.
    seed({
      status: 'completed',
      paths: { ...ALL_DONE },
      badgeClaim: { badge: 'ditto-explorer', status: 'claimed', claimEventId: 'f'.repeat(64) },
    });
    render(<MissionsWidget />);

    expect(screen.getByText('Reward unlocked')).toBeInTheDocument();
    // …without asking again for something already done.
    expect(screen.getByText('Badge claim submitted')).toBeInTheDocument();
    expect(screen.queryByText('Claim your badge')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Claim reward' })).toBeNull();
  });
});

describe('mobile teaser', () => {
  beforeEach(() => {
    state = undefined;
    celebration = { celebrating: false };
  });

  it('renders nothing before the mission exists', () => {
    expect(render(<MobileMissionTeaser />).container).toBeEmptyDOMElement();
  });

  it('is compact and in-flow, never fixed or floating', () => {
    // The full-height Home card it replaces consumed ~99% of a 360x640 viewport
    // and pushed the product entirely below the fold.
    seed();
    const wrapper = render(<MobileMissionTeaser />).container.firstElementChild!;
    expect(wrapper.className).not.toMatch(/\b(fixed|sticky|absolute)\b/);
    expect(wrapper.className).not.toMatch(/\bh-(screen|full)\b/);
  });

  it('hides at the desktop breakpoint, where the sidebar widget takes over', () => {
    seed();
    expect(render(<MobileMissionTeaser />).container.firstElementChild).toHaveClass('lg:hidden');
  });

  it('invites rather than showing a 0/4 meter while the intro is pending', () => {
    seed({ intro: {} });
    render(<MobileMissionTeaser />);
    expect(screen.getByText(/Your first journey through Ditto is ready/)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows progress once the introduction is behind us', () => {
    seed({ paths: { ...createInitialGuideState(1).paths, 'find-people': 'completed' } });
    render(<MobileMissionTeaser />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('disappears when the mission is hidden', () => {
    seed({ status: 'skipped', skippedAt: 3_000 });
    expect(render(<MobileMissionTeaser />).container).toBeEmptyDOMElement();
  });
});

/**
 * The 4/4 moment, on both compact surfaces.
 *
 * The fourth task is always the last one, so completing it both finishes the
 * mission and unlocks the reward in the same write. Without an explicit rule
 * the surfaces swapped straight to "Reward unlocked" the instant it landed,
 * throwing away the count reaching 4/4 and the acknowledgement of what the user
 * just did. The order that must survive is: *you did this* → *that's 4 of 4* →
 * *here's your reward*.
 *
 * That rule now lives in `useMissionSurfaceState` rather than being restated in
 * each surface, which is exactly why it is worth pinning here.
 */
/**
 * The compact surfaces have never claimed anything: their reward action is a
 * *navigation* to `/missions`, where the reward lives. It was labelled "Claim
 * reward", so pressing it looked like it should submit something and then
 * visibly did nothing but change page — the reported "no feedback" defect.
 *
 * These pin the behaviour (it navigates) and the promise (it says so), because
 * the fix was the label rather than the behaviour: a 300px sidebar card is not
 * where an irreversible public publish belongs, and a second full-screen
 * ceremony mounted here would give one act two owners.
 */
describe('the reward action on the compact surfaces', () => {
  const completed = () => ({
    status: 'completed' as const,
    paths: { ...ALL_DONE },
  });

  beforeEach(() => {
    state = undefined;
    celebration = { celebrating: false };
    navigate.mockClear();
  });

  for (const [name, Surface] of [
    ['sidebar widget', MissionsWidget],
    ['mobile teaser', MobileMissionTeaser],
  ] as const) {
    it(`${name}: takes the user to the reward instead of claiming it`, () => {
      seed(completed());
      render(<Surface />);

      const action = screen.getAllByRole('button').find((b) => /reward/i.test(b.textContent ?? ''))!;
      fireEvent.click(action);

      expect(navigate).toHaveBeenCalledWith('/missions');
    });

    it(`${name}: never says it will claim`, () => {
      seed(completed());
      const { container } = render(<Surface />);

      // "Claim reward" / "Claim your badge" promised a submit and delivered a
      // page change. Nothing here may make that promise again.
      expect(container.textContent).not.toMatch(/claim reward/i);
      expect(container.textContent).not.toMatch(/claim your badge/i);
      expect(container.textContent).toMatch(/reward/i);
    });
  }

  it('sidebar widget: still reports a submitted claim rather than asking again', () => {
    seed({
      ...completed(),
      badgeClaim: { badge: 'ditto-explorer', status: 'claimed', claimEventId: 'f'.repeat(64) },
    });
    render(<MissionsWidget />);

    expect(screen.getByText('Badge claim submitted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view journey/i })).toBeEnabled();
  });
});

describe('the 4/4 completion moment', () => {
  beforeEach(() => {
    state = undefined;
    celebration = { celebrating: false };
  });

  const completed = () => ({
    status: 'completed' as const,
    paths: { ...ALL_DONE },
    interact: { action: 'repost' as const, completedAt: 4_000 },
  });

  for (const [name, Surface] of [
    ['sidebar widget', MissionsWidget],
    ['mobile teaser', MobileMissionTeaser],
  ] as const) {
    it(`${name}: holds progress at 4/4 through the celebration`, () => {
      celebration = { celebrating: true, completedPath: 'interact' };
      seed(completed());
      render(<Surface />);

      // The count is still on screen, and it reads 4/4 rather than being
      // replaced by the reward framing.
      expect(screen.getByText('4/4')).toBeInTheDocument();
      // …with the action-specific acknowledgement, not a generic success.
      expect(screen.getByText('You shared a post.')).toBeInTheDocument();
      // …and the reward prompt is deliberately still one settle away.
      expect(screen.queryByText(/Reward unlocked/)).not.toBeInTheDocument();
    });

    it(`${name}: settles into the reward state once the celebration ends`, () => {
      celebration = { celebrating: false };
      seed(completed());
      render(<Surface />);

      expect(screen.queryByText('4/4')).not.toBeInTheDocument();
      expect(screen.queryByText('You shared a post.')).not.toBeInTheDocument();
      expect(screen.getAllByText(/Reward unlocked|Claim your badge/).length).toBeGreaterThan(0);
    });

    it(`${name}: hides once the reward has actually been revealed`, () => {
      seed({
        ...completed(),
        badgeClaim: { badge: 'ditto-explorer', status: 'claimed', revealedAt: 9_000 },
      });
      expect(render(<Surface />).container).toBeEmptyDOMElement();
    });

    it(`${name}: stays discoverable while the reveal is still owed`, () => {
      // claim submitted, reward not revealed — the ceremony is still owed, so
      // the surface that leads to it must not have gone.
      seed({ ...completed(), badgeClaim: { badge: 'ditto-explorer', status: 'claimed' } });
      expect(render(<Surface />).container).not.toBeEmptyDOMElement();
      expect(screen.getAllByText(/Badge claim submitted/).length).toBeGreaterThan(0);
    });
  }
});
