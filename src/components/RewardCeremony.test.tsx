import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { MissionReward } from './MissionReward';
import {
  areAllPathsCompleted,
  badgeRewardView,
  createInitialGuideState,
  isCeremonyOwed,
  rewardPresentation,
  type PostOnboardingGuideState,
} from '@/lib/postOnboardingGuide';

/**
 * The ceremony shell: the stage the reward reveal will eventually happen on.
 *
 * Two things dominate these tests, because they are the two ways a modal stage
 * goes wrong. The first is that it must be *inert* — opening and closing it a
 * hundred times while the reveal is being built must not publish anything, write
 * anything, or move the mission a single step. The second is that it must be
 * *escapable*, by every route a person actually reaches for: the button, the
 * keyboard, the backdrop, and the phone's Back gesture.
 *
 * Nothing here asserts pixels. The travel is checked as intent — a transform was
 * applied, or deliberately was not — because the geometry is a design decision
 * and jsdom has no layout to measure anyway.
 */

let state: PostOnboardingGuideState | undefined;
const claim = vi.fn();
const markRewardRevealed = vi.fn();
const completeBadgeClaim = vi.fn();
const publishEvent = vi.fn();
let reducedMotion = false;

vi.mock('@/lib/reducedMotion', () => ({ prefersReducedMotion: () => reducedMotion }));

vi.mock('@/hooks/useBadgeClaim', () => ({
  useBadgeClaim: () => ({
    claim,
    markRewardRevealed,
    rewardView: badgeRewardView(state),
    isClaiming: badgeRewardView(state) === 'claiming',
    isClaimed: state?.badgeClaim?.status === 'claimed',
    isRevealed: badgeRewardView(state) === 'revealed',
    badgeClaim: state?.badgeClaim,
  }),
}));
vi.mock('@/hooks/usePostOnboardingGuide', () => ({
  usePostOnboardingGuide: () => ({ state, completeBadgeClaim, markRewardRevealed }),
}));
vi.mock('@/hooks/useNostrPublish', () => ({
  useNostrPublish: () => ({ mutateAsync: publishEvent }),
}));
vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ config: { appId: 'ditto', appName: 'Ditto' } }),
}));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { pubkey: 'a'.repeat(64) } }),
}));

const ALL_DONE = {
  'find-people': 'completed',
  'post-small': 'completed',
  customize: 'completed',
  interact: 'completed',
} as const;

function seed(overrides: Partial<PostOnboardingGuideState> = {}) {
  state = {
    ...createInitialGuideState(1_000),
    intro: { acknowledgedAt: 2_000 },
    ...overrides,
  };
}

function ready() {
  seed({ paths: { ...ALL_DONE }, status: 'completed' });
}

/**
 * Reports the live location so history behaviour can be asserted, and offers a
 * Back control.
 *
 * `window.history.back()` is useless here: `MemoryRouter` keeps its own stack
 * and never touches the browser's. `navigate(-1)` is the same pop the phone's
 * Back gesture performs on the router, which is the thing the ceremony actually
 * reacts to.
 */
function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <div
        data-testid="location"
        data-pathname={location.pathname}
        data-ceremony={String(!!(location.state as { rewardCeremony?: boolean } | null)?.rewardCeremony)}
      />
      <button type="button" onClick={() => navigate(-1)}>
        browser back
      </button>
    </div>
  );
}

/**
 * Render the reward panel inside a real router. The ceremony's Back handling is
 * built on router history, so mocking the router away would test nothing.
 */
function renderReward(celebrating = false): ReturnType<typeof render> {
  const openable = state ? isCeremonyOwed(state) &&
    rewardPresentation(badgeRewardView(state), celebrating) !== 'settling' : false;

  return render(
    <MemoryRouter initialEntries={['/missions']}>
      <Routes>
        <Route
          path="/missions"
          element={
            <>
              <LocationProbe />
              <MissionReward
                completedCount={state && areAllPathsCompleted(state) ? 4 : 3}
                totalCount={4}
                celebrating={celebrating}
                ceremonyOpenable={openable}
              />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const openButton = () => screen.queryByRole('button', { name: /view your reward/i });
const stage = () => document.querySelector('[data-reward-ceremony]');
const snapshot = () => JSON.stringify(state);

beforeEach(() => {
  state = undefined;
  reducedMotion = false;
  claim.mockClear();
  markRewardRevealed.mockClear();
  completeBadgeClaim.mockClear();
  publishEvent.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  // The travel tests spy on `getBoundingClientRect`; without this the next test
  // inherits a fake layout and stops testing what it says it tests.
  vi.restoreAllMocks();
});

describe('reward ceremony — who may open it', () => {
  it('offers no way in before the journey is finished', () => {
    seed({ paths: { ...ALL_DONE, interact: 'not_started' } });
    renderReward();
    expect(openButton()).toBeNull();
  });

  it('stays shut while the completion celebration is still playing', () => {
    // The reward's own moment must not start on top of the moment that earned
    // it — the same rule that holds back its copy, its CTA and its glow.
    ready();
    renderReward(true);
    expect(openButton()).toBeNull();
  });

  it('opens once the journey is complete and the celebration has settled', () => {
    ready();
    renderReward();
    expect(openButton()).toBeEnabled();
  });

  it('stays reachable while a claim is in flight, failed, or already submitted', () => {
    // Ceremony eligibility is "earned and not yet revealed", so every state
    // between finishing and revealing keeps its way in.
    for (const badgeClaim of [
      { badge: 'ditto-explorer', status: 'claiming', claimingStartedAt: Date.now() },
      { badge: 'ditto-explorer', status: 'failed', failedAt: 1 },
      { badge: 'ditto-explorer', status: 'claimed', claimEventId: 'x', claimedAt: 1 },
    ] as const) {
      seed({ paths: { ...ALL_DONE }, status: 'completed', badgeClaim });
      const { unmount } = renderReward();
      expect(openButton()).toBeEnabled();
      unmount();
    }
  });

  it('offers no way in once the reward has been revealed', () => {
    seed({
      paths: { ...ALL_DONE },
      status: 'completed',
      badgeClaim: {
        badge: 'ditto-explorer',
        status: 'claimed',
        claimEventId: 'x',
        claimedAt: 1,
        revealedAt: 2,
      },
    });
    renderReward();
    expect(openButton()).toBeNull();
  });

  it('never opens itself', () => {
    ready();
    renderReward();
    expect(stage()).toBeNull();
  });
});

describe('reward ceremony — opening and closing', () => {
  it('opens on the gesture, and shows the sealed reward on its own stage', async () => {
    ready();
    renderReward();

    fireEvent.click(openButton()!);

    await waitFor(() => expect(stage()).not.toBeNull());
    expect(within(stage() as HTMLElement).getByText('Your reward is waiting.')).toBeInTheDocument();
    expect(stage()!.querySelector('[data-sealed-reward-art]')).not.toBeNull();
  });

  it('hides the reward it borrowed, so there is never a second one', async () => {
    ready();
    const { container } = renderReward();
    fireEvent.click(openButton()!);

    await waitFor(() => expect(stage()).not.toBeNull());
    // Still laid out (measurable, no reflow), just not painted.
    const source = container.querySelector('[data-sealed-reward-art]')!.parentElement!;
    expect(source.className).toContain('invisible');
  });

  it('closes on the Close control', async () => {
    ready();
    renderReward();
    fireEvent.click(openButton()!);
    await waitFor(() => expect(stage()).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    await waitFor(() => expect(stage()).toBeNull());
  });

  it('closes on Escape', async () => {
    ready();
    renderReward();
    fireEvent.click(openButton()!);
    await waitFor(() => expect(stage()).not.toBeNull());

    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(stage()).toBeNull());
  });

  it('closes on the backdrop', async () => {
    ready();
    renderReward();
    fireEvent.click(openButton()!);
    await waitFor(() => expect(stage()).not.toBeNull());

    fireEvent.pointerDown(document.querySelector('[data-reward-ceremony-scrim]') as HTMLElement);
    await waitFor(() => expect(stage()).toBeNull());
  });

  it('can be opened again after closing', async () => {
    ready();
    renderReward();

    for (let i = 0; i < 3; i++) {
      fireEvent.click(openButton()!);
      await waitFor(() => expect(stage()).not.toBeNull());
      fireEvent.keyDown(document.body, { key: 'Escape' });
      await waitFor(() => expect(stage()).toBeNull());
    }

    expect(openButton()).toBeEnabled();
  });

  it('makes one stage from a double-tap, not two', async () => {
    ready();
    renderReward();

    const button = openButton()!;
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(stage()).not.toBeNull());
    expect(document.querySelectorAll('[data-reward-ceremony]')).toHaveLength(1);
  });
});

describe('reward ceremony — it changes nothing', () => {
  it('publishes nothing and claims nothing, opened or closed', async () => {
    ready();
    renderReward();

    fireEvent.click(openButton()!);
    await waitFor(() => expect(stage()).not.toBeNull());
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(stage()).toBeNull());

    // The whole point of the shell: it is a room, and rooms do not sign events.
    expect(publishEvent).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
    expect(completeBadgeClaim).not.toHaveBeenCalled();
    expect(markRewardRevealed).not.toHaveBeenCalled();
  });

  it('leaves the mission state byte-identical', async () => {
    ready();
    const before = snapshot();
    renderReward();

    fireEvent.click(openButton()!);
    await waitFor(() => expect(stage()).not.toBeNull());
    expect(snapshot()).toBe(before);

    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(stage()).toBeNull());

    expect(snapshot()).toBe(before);
    expect(state?.badgeClaim).toBeUndefined();
    // Above all: the reveal is still owed. Looking at the sealed reward is not
    // the same as having been shown it.
    expect(state?.badgeClaim?.revealedAt).toBeUndefined();
    expect(badgeRewardView(state)).toBe('ready');
  });
});

describe('reward ceremony — Back and history', () => {
  const ceremonyEntry = () =>
    screen.getByTestId('location').getAttribute('data-ceremony');

  it('adds exactly one history entry, on the same page', async () => {
    ready();
    renderReward();
    expect(ceremonyEntry()).toBe('false');

    fireEvent.click(openButton()!);

    await waitFor(() => expect(ceremonyEntry()).toBe('true'));
    // Opening a stage is not navigating away from the page it belongs to.
    expect(screen.getByTestId('location').getAttribute('data-pathname')).toBe('/missions');
  });

  it('closes on browser Back, leaving the user on /missions', async () => {
    ready();
    renderReward();
    const back = screen.getByRole('button', { name: 'browser back' });
    fireEvent.click(openButton()!);
    await waitFor(() => expect(stage()).not.toBeNull());

    // Captured before opening: the stage is modal, so Radix hides everything
    // behind it from the accessibility tree while it is up.
    fireEvent.click(back);

    await waitFor(() => expect(stage()).toBeNull());
    expect(screen.getByTestId('location').getAttribute('data-pathname')).toBe('/missions');
    expect(ceremonyEntry()).toBe('false');
  });

  it('gives the history entry back when closed deliberately', async () => {
    // Otherwise every open/close cycle would leave a Back press that appears to
    // do nothing, and the user would have to press it once per look.
    ready();
    renderReward();

    for (let i = 0; i < 3; i++) {
      fireEvent.click(openButton()!);
      await waitFor(() => expect(ceremonyEntry()).toBe('true'));
      fireEvent.keyDown(document.body, { key: 'Escape' });
      await waitFor(() => expect(ceremonyEntry()).toBe('false'));
    }

    expect(stage()).toBeNull();
    expect(screen.getByTestId('location').getAttribute('data-pathname')).toBe('/missions');
  });
});

describe('reward ceremony — travel', () => {
  it('flies from the reward when it can measure one', async () => {
    ready();
    // jsdom reports zero-size rects, so the source has to be given a box for the
    // travel to have anything to fly from.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 40, y: 60, width: 112, height: 112, top: 60, left: 40, right: 152, bottom: 172,
      toJSON: () => ({}),
    } as DOMRect);

    renderReward();
    fireEvent.click(openButton()!);

    // Read synchronously: the starting transform is applied in a layout effect
    // during the same commit, and the animation clears it again when it lands —
    // so anything that waits is racing the thing it is trying to observe.
    const art = stage()!.querySelector('[data-sealed-reward-art]')!.parentElement as HTMLElement;
    // Placed over the source before the first paint, rather than appearing at
    // its destination and then sliding.
    expect(art.style.transform).toMatch(/translate\(.*\) scale\(/);
  });

  it('does not guess coordinates when there is nothing to measure', async () => {
    ready();
    // jsdom's default: every rect is 0×0, which `isUsableRect` rejects.
    renderReward();
    fireEvent.click(openButton()!);
    await waitFor(() => expect(stage()).not.toBeNull());

    const art = stage()!.querySelector('[data-sealed-reward-art]')!.parentElement as HTMLElement;
    expect(art.style.transform).toBe('');
    // …and it settles anyway, rather than waiting for an animation that can
    // never run.
    await waitFor(() =>
      expect(within(stage() as HTMLElement).getByText('Your reward is waiting.')).toBeVisible(),
    );
  });

  it('skips the travel entirely under reduced motion', async () => {
    reducedMotion = true;
    ready();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 40, y: 60, width: 112, height: 112, top: 60, left: 40, right: 152, bottom: 172,
      toJSON: () => ({}),
    } as DOMRect);

    renderReward();
    fireEvent.click(openButton()!);
    await waitFor(() => expect(stage()).not.toBeNull());

    const art = stage()!.querySelector('[data-sealed-reward-art]')!.parentElement as HTMLElement;
    expect(art.style.transform).toBe('');
    // The composition is there to read immediately: reduced motion removes the
    // movement, not the ceremony.
    expect(within(stage() as HTMLElement).getByText('Your reward is waiting.')).toBeVisible();
  });

  it('closes cleanly when the reward it came from has gone', async () => {
    ready();
    const { rerender } = renderReward();
    fireEvent.click(openButton()!);
    await waitFor(() => expect(stage()).not.toBeNull());

    // The panel unmounts underneath the ceremony (a route change, an account
    // switch). Closing must not depend on the source still existing.
    rerender(<MemoryRouter initialEntries={['/missions']} />);
    await waitFor(() => expect(stage()).toBeNull());
  });
});

describe('reward ceremony — accessibility', () => {
  it('is a modal with a real name', async () => {
    ready();
    renderReward();
    fireEvent.click(openButton()!);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('Your reward is waiting.');
  });

  it('names its Close control', async () => {
    ready();
    renderReward();
    fireEvent.click(openButton()!);

    await waitFor(() => expect(stage()).not.toBeNull());
    expect(within(stage() as HTMLElement).getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('keeps the reward art decorative on the stage too', async () => {
    ready();
    renderReward();
    fireEvent.click(openButton()!);

    await waitFor(() => expect(stage()).not.toBeNull());
    expect(stage()!.querySelector('[data-sealed-reward-art]')).toHaveAttribute('aria-hidden');
  });

  it('returns focus to the control that opened it', async () => {
    ready();
    renderReward();
    const trigger = openButton()!;

    // A real click focuses the control first; `fireEvent` does not, and Radix
    // restores focus to whatever had it when the dialog opened.
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(stage()).not.toBeNull());
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(stage()).toBeNull());

    await waitFor(() => expect(openButton()).toHaveFocus());
  });
});
