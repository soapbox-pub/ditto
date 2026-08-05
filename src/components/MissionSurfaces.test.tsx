import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import type { ReactElement } from 'react';

import { MissionsWidget } from './MissionsWidget';
import { MobileMissionTeaser } from './MobileMissionTeaser';
import {
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
let arrivalSettled = true;

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
    badgeClaim: state?.badgeClaim,
    introState: deriveIntroState(state),
    introOutstanding: isIntroOutstanding(state),
    nextPath: nextRecommendedPath(state),
    dismissGuide: vi.fn(),
    acknowledgeIntro: vi.fn(),
    postponeIntro: vi.fn(),
    markIntroPresented: vi.fn(),
  }),
}));
vi.mock('@/hooks/useMissionCelebration', () => ({
  useMissionCelebration: () => ({ celebrating: false }),
}));
vi.mock('@/hooks/useArrivalSettled', () => ({
  useArrivalSettled: () => arrivalSettled,
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
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

/** These surfaces use `FormattedMessage`, so they need an intl ancestor. */
function render(ui: ReactElement) {
  return rtlRender(<IntlProvider locale="en">{ui}</IntlProvider>);
}

const ALL_DONE = {
  'find-people': 'completed',
  'post-small': 'completed',
  customize: 'completed',
  explore: 'completed',
} as const;

/** Acknowledged intro by default — most scenarios are about the active mission. */
function seed(overrides: Partial<PostOnboardingGuideState> = {}) {
  const base = createInitialGuideState(1_000);
  state = { ...base, intro: { acknowledgedAt: 2_000 }, ...overrides };
}

describe('desktop sidebar widget', () => {
  beforeEach(() => {
    state = undefined;
    arrivalSettled = true;
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
    expect(screen.queryByText('Explore Ditto')).not.toBeInTheDocument();
  });

  it('shows the introduction while it is pending', () => {
    seed({ intro: {} });
    render(<MissionsWidget />);
    expect(screen.getByText(/Your first journey through Ditto is ready/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start exploring/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /maybe later/i })).toBeInTheDocument();
  });

  it('holds the introduction back until the arrival has settled', () => {
    // Otherwise the Explorer intro collides with the app reveal and neither
    // reads as intentional.
    seed({ intro: {} });
    arrivalSettled = false;
    expect(render(<MissionsWidget />).container).toBeEmptyDOMElement();
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

  it('reframes as a claim prompt once the reward is unlocked', () => {
    seed({ status: 'completed', paths: { ...ALL_DONE } });
    render(<MissionsWidget />);
    expect(screen.getByRole('button', { name: /claim reward/i })).toBeInTheDocument();
  });

  it('disappears once the badge is claimed', () => {
    seed({
      status: 'completed',
      paths: { ...ALL_DONE },
      badgeClaim: { badge: 'ditto-explorer', status: 'claimed', claimEventId: 'f'.repeat(64) },
    });
    expect(render(<MissionsWidget />).container).toBeEmptyDOMElement();
  });
});

describe('mobile teaser', () => {
  beforeEach(() => {
    state = undefined;
    arrivalSettled = true;
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

  it('waits for the arrival to settle before appearing', () => {
    seed();
    arrivalSettled = false;
    expect(render(<MobileMissionTeaser />).container).toBeEmptyDOMElement();
  });

  it('disappears when the mission is hidden', () => {
    seed({ status: 'skipped', skippedAt: 3_000 });
    expect(render(<MobileMissionTeaser />).container).toBeEmptyDOMElement();
  });
});
