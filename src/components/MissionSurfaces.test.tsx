import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { MissionsWidget } from './MissionsWidget';
import { MobileMissionTeaser } from './MobileMissionTeaser';
import {
  createInitialGuideState,
  type PostOnboardingGuideState,
} from '@/lib/postOnboardingGuide';

/**
 * Responsive-surface contract.
 *
 * The mission has one coherent strategy rather than a pile of historical
 * placements: the home feed shows an in-flow card, other pages show a compact
 * teaser (sidebar on desktop, in-flow on mobile), and `/missions` is the
 * durable detail view. These tests pin the two rules that keep it from
 * degenerating into several prompts competing for attention:
 *
 *  1. the desktop and mobile teasers are mutually exclusive by breakpoint; and
 *  2. both self-hide for exactly the same mission states.
 */

let state: PostOnboardingGuideState | undefined;

vi.mock('@/hooks/usePostOnboardingGuide', () => ({
  usePostOnboardingGuide: () => ({
    state,
    isActive: state?.status === 'active',
    isCompleted: state?.status === 'completed',
    isDismissed: state?.status === 'skipped',
    completedCount: 1,
    totalCount: 4,
    badgeClaim: state?.badgeClaim,
  }),
}));
vi.mock('@/hooks/useMissionCelebration', () => ({
  useMissionCelebration: () => ({ celebrating: false }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const ALL_DONE = {
  'find-people': 'completed',
  'post-small': 'completed',
  customize: 'completed',
  explore: 'completed',
} as const;

function seed(overrides: Partial<PostOnboardingGuideState> = {}) {
  state = { ...createInitialGuideState(1_000), ...overrides };
}

describe('mission teaser visibility', () => {
  beforeEach(() => {
    state = undefined;
  });

  it('renders nothing before the mission exists', () => {
    const mobile = render(<MobileMissionTeaser />);
    expect(mobile.container).toBeEmptyDOMElement();

    const desktop = render(<MissionsWidget />);
    expect(desktop.container).toBeEmptyDOMElement();
  });

  it('renders while the mission is active', () => {
    seed();
    render(<MobileMissionTeaser />);
    render(<MissionsWidget />);
    expect(screen.getAllByRole('button').length).toBe(2);
  });

  it('renders a claim prompt once complete but unclaimed', () => {
    seed({ status: 'completed', paths: { ...ALL_DONE } });
    render(<MobileMissionTeaser />);
    expect(screen.getByText(/claim reward/i)).toBeInTheDocument();
  });

  it('disappears once the badge is claimed', () => {
    seed({
      status: 'completed',
      paths: { ...ALL_DONE },
      badgeClaim: { badge: 'ditto-explorer', status: 'claimed', claimEventId: 'f'.repeat(64) },
    });
    expect(render(<MobileMissionTeaser />).container).toBeEmptyDOMElement();
    expect(render(<MissionsWidget />).container).toBeEmptyDOMElement();
  });

  it('disappears once the mission is dismissed', () => {
    seed({ status: 'skipped', skippedAt: 2_000 });
    expect(render(<MobileMissionTeaser />).container).toBeEmptyDOMElement();
    expect(render(<MissionsWidget />).container).toBeEmptyDOMElement();
  });
});

describe('responsive surface strategy', () => {
  beforeEach(() => seed());

  it('hides the mobile teaser at the desktop breakpoint', () => {
    // The desktop sidebar widget takes over at `lg`, so the two can never both
    // be on screen.
    const { container } = render(<MobileMissionTeaser />);
    expect(container.firstElementChild).toHaveClass('lg:hidden');
  });

  it('keeps the mobile teaser in normal flow, never fixed or floating', () => {
    // In-flow is what stops it from covering page tabs, feed controls, or
    // navigation, and is why it needs no height compensation.
    const wrapper = render(<MobileMissionTeaser />).container.firstElementChild!;
    const className = wrapper.className;
    expect(className).not.toMatch(/\bfixed\b/);
    expect(className).not.toMatch(/\bsticky\b/);
    expect(className).not.toMatch(/\babsolute\b/);
  });

  it('exposes progress to assistive tech on both surfaces', () => {
    render(<MobileMissionTeaser />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');

    render(<MissionsWidget />);
    expect(
      screen.getAllByRole('button', { name: /1 of 4 steps complete/i }).length,
    ).toBeGreaterThan(0);
  });
});
