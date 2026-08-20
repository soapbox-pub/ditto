import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { MissionReward } from './MissionReward';
import {
  CEREMONY_MIN_ACTING_MS,
  CEREMONY_REVEAL_MS,
  CEREMONY_SLOW_MS,
} from '@/hooks/useRewardCeremony';
import { BADGES_TAB_PARAM } from '@/lib/badgesTabs';
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
        data-search={location.search}
        data-hash={location.hash}
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

/**
 * The panel's own trigger. Scoped outside the stage on purpose: once the
 * ceremony is open there is a second "Reveal your reward" on it, and that one is
 * the ceremonial act rather than the way in.
 */
const openButton = () =>
  (Array.from(document.querySelectorAll('button')) as HTMLButtonElement[]).find(
    (b) => /reveal your reward/i.test(b.textContent ?? '') && !b.closest('[data-reward-ceremony]'),
  ) ?? null;

/** The ceremonial act, on the stage. */
const revealButton = () =>
  document.querySelector<HTMLButtonElement>('[data-reward-ceremony] button');
const stage = () => document.querySelector('[data-reward-ceremony]');
const snapshot = () => JSON.stringify(state);

beforeEach(() => {
  state = undefined;
  reducedMotion = false;
  claim.mockClear();
  claim.mockReset();
  claim.mockResolvedValue({ status: 'claimed', claimEventId: 'e'.repeat(64) });
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
    const art = stage()!.querySelector('[data-reward-travel]') as HTMLElement;
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

    const art = stage()!.querySelector('[data-reward-travel]') as HTMLElement;
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

    const art = stage()!.querySelector('[data-reward-travel]') as HTMLElement;
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

/**
 * The ceremonial act. This is where the public kind 30637 is published, so the
 * bar is: it happens once, it happens only when the user asks for it, and the
 * stage never says anything about it that isn't true yet.
 */
describe('reward ceremony — the claim', () => {
  /** Open the stage and wait for it to settle. */
  async function openStage() {
    renderReward();
    fireEvent.click(openButton()!);
    await waitFor(() => expect(stage()).not.toBeNull());
    await waitFor(() => expect(revealButton()).toHaveTextContent(/reveal your reward/i));
  }

  it('offers the act, and says what it will do', async () => {
    ready();
    await openStage();

    expect(revealButton()).toHaveTextContent(/reveal your reward/i);
    // The gesture publishes a public event, so the stage says so before it does.
    expect(
      within(stage() as HTMLElement).getByText(/publishes a public claim/i),
    ).toBeInTheDocument();
  });

  it('publishes exactly once, and only when asked', async () => {
    ready();
    await openStage();
    expect(claim).not.toHaveBeenCalled();

    fireEvent.click(revealButton()!);
    await waitFor(() => expect(claim).toHaveBeenCalledTimes(1));
    // The claim and the reveal go down together, in one write. The timestamp is
    // the irreversible point, and it is taken before a single pixel moves.
    expect(claim).toHaveBeenCalledWith({ revealedAt: expect.any(Number) });
  });

  it('does not publish twice on a double tap', async () => {
    ready();
    claim.mockImplementation(() => new Promise(() => {}));
    await openStage();

    const act = revealButton()!;
    fireEvent.click(act);
    fireEvent.click(act);
    fireEvent.click(act);

    await waitFor(() => expect(claim).toHaveBeenCalledTimes(1));
  });

  it('acknowledges the press immediately', async () => {
    ready();
    claim.mockImplementation(() => new Promise(() => {}));
    await openStage();
    fireEvent.click(revealButton()!);

    await waitFor(() => expect(stage()).toHaveAttribute('data-phase', 'acting'));
    // The seal is the thing being watched, so the status is a line of text.
    expect(within(stage() as HTMLElement).getByRole('status')).toHaveTextContent(
      /sending your claim/i,
    );
    expect(stage()!.querySelector('[data-reward-seal]')?.className).toContain(
      'reward-seal-press',
    );
  });

  it('holds the act long enough to be read, even when the claim is instant', async () => {
    ready();
    claim.mockResolvedValue({ status: 'claimed', claimEventId: 'e'.repeat(64) });
    await openStage();

    fireEvent.click(revealButton()!);
    await waitFor(() => expect(stage()).toHaveAttribute('data-phase', 'acting'));

    // Still acting well after the publish resolved: a send that flashes past in
    // 50ms reads as a glitch rather than as an act.
    await new Promise((r) => setTimeout(r, CEREMONY_MIN_ACTING_MS / 2));
    expect(stage()).toHaveAttribute('data-phase', 'acting');

    await waitFor(() => expect(stage()).toHaveAttribute('data-phase', 'revealing'), {
      timeout: 3_000,
    });
  });

  it('explains a slow signer once, and still succeeds afterwards', async () => {
    ready();
    let resolveClaim: (o: { status: 'claimed'; claimEventId: string }) => void = () => {};
    claim.mockImplementation(() => new Promise((r) => { resolveClaim = r; }));
    await openStage();
    fireEvent.click(revealButton()!);

    const status = () => within(stage() as HTMLElement).getByRole('status').textContent ?? '';
    await waitFor(() => expect(status()).toMatch(/sending your claim/i));

    // The copy names the likely cause once. It cancels nothing.
    await waitFor(() => expect(status()).toMatch(/your signer may be waiting for you/i), {
      timeout: CEREMONY_SLOW_MS + 2_000,
    });
    expect(claim).toHaveBeenCalledTimes(1);

    resolveClaim({ status: 'claimed', claimEventId: 'e'.repeat(64) });
    await waitFor(() => expect(stage()).toHaveAttribute('data-phase', 'revealing'), {
      timeout: 3_000,
    });
  });

  it('reveals the badge, and says only what is true about it', async () => {
    ready();
    claim.mockResolvedValue({ status: 'claimed', claimEventId: 'e'.repeat(64) });
    await openStage();
    // Sealed right up to the moment the claim lands.
    expect(stage()!.querySelector('[data-sealed-reward-art]')).not.toBeNull();
    expect(stage()!.querySelector('[data-explorer-badge-image]')).toBeNull();

    fireEvent.click(revealButton()!);
    await waitFor(() => expect(stage()).toHaveAttribute('data-phase', 'revealing'), {
      timeout: 3_000,
    });

    const stageEl = stage() as HTMLElement;
    // The badge itself, untreated, on the same object the seal was on.
    expect(stageEl.querySelector('[data-revealed-reward-art]')).not.toBeNull();
    expect(stageEl.querySelector('[data-explorer-badge-image]')).not.toBeNull();
    expect(stageEl.querySelector('[data-sealed-reward-art]')).toBeNull();
    expect(within(stageEl).getByText('Ditto Explorer')).toBeInTheDocument();
    expect(within(stageEl).getByText(/reward revealed/i)).toBeInTheDocument();
    expect(within(stageEl).getByText(/appear in Badges once it has been issued/i))
      .toBeInTheDocument();
    // Revealed is not awarded, and never says it is.
    expect(within(stageEl).queryByText(/awarded|you own|notified|pending approval|issuing/i))
      .toBeNull();
  });

  it('offers the way onward only once the composition has settled', async () => {
    ready();
    claim.mockResolvedValue({ status: 'claimed', claimEventId: 'e'.repeat(64) });
    await openStage();
    fireEvent.click(revealButton()!);

    await waitFor(() => expect(stage()).toHaveAttribute('data-phase', 'revealing'), {
      timeout: 3_000,
    });
    // While the badge is resolving there is one control, and it is Skip.
    expect(within(stage() as HTMLElement).queryByRole('button', { name: /open badges/i }))
      .toBeNull();
    expect(within(stage() as HTMLElement).getByRole('button', { name: /^skip$/i }))
      .toBeEnabled();

    await waitFor(() => expect(stage()).toHaveAttribute('data-phase', 'settled'), {
      timeout: CEREMONY_REVEAL_MS + 2_000,
    });
    expect(within(stage() as HTMLElement).getByRole('button', { name: /open badges/i }))
      .toBeEnabled();
    expect(within(stage() as HTMLElement).getByRole('button', { name: /done/i })).toBeEnabled();
    expect(within(stage() as HTMLElement).queryByRole('button', { name: /^skip$/i })).toBeNull();
  });

  it('lets the reveal be skipped without undoing it', async () => {
    ready();
    claim.mockResolvedValue({ status: 'claimed', claimEventId: 'e'.repeat(64) });
    await openStage();
    fireEvent.click(revealButton()!);
    await waitFor(() => expect(stage()).toHaveAttribute('data-phase', 'revealing'), {
      timeout: 3_000,
    });

    fireEvent.click(within(stage() as HTMLElement).getByRole('button', { name: /^skip$/i }));

    await waitFor(() => expect(stage()).toHaveAttribute('data-phase', 'settled'));
    // Skipping the animation is not undoing the reward: the badge is fully
    // there, and it lands without easing rather than continuing to ease.
    const image = stage()!.querySelector<HTMLImageElement>('[data-explorer-badge-image]')!;
    expect(image.style.transition).toBe('');
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it('keeps the reward sealed when the claim fails, and offers a retry', async () => {
    ready();
    claim.mockResolvedValue({ status: 'failed', error: new Error('relay unreachable') });
    await openStage();
    fireEvent.click(revealButton()!);

    await waitFor(() => expect(stage()).toHaveAttribute('data-phase', 'failed'), {
      timeout: 3_000,
    });
    const stageEl = stage() as HTMLElement;
    expect(within(stageEl).getByText(/that didn.t go through/i)).toBeInTheDocument();
    expect(within(stageEl).getByText(/nothing was lost/i)).toBeInTheDocument();
    expect(within(stageEl).getByRole('button', { name: /try again/i })).toBeEnabled();
    expect(within(stageEl).getByRole('button', { name: /close/i })).toBeEnabled();
    expect(stageEl.querySelector('[data-sealed-reward-art]')).not.toBeNull();
    expect(state?.badgeClaim?.revealedAt).toBeUndefined();
  });

  it('retries for real, and stays retryable however often it fails', async () => {
    ready();
    claim.mockResolvedValue({ status: 'failed', error: new Error('nope') });
    await openStage();

    for (let attempt = 1; attempt <= 3; attempt++) {
      fireEvent.click(
        within(stage() as HTMLElement).getByRole('button', { name: /reveal your reward|try again/i }),
      );
      await waitFor(() => expect(stage()).toHaveAttribute('data-phase', 'failed'), {
        timeout: 3_000,
      });
      expect(claim).toHaveBeenCalledTimes(attempt);
    }

    // No lockout, ever. The journey is finished either way.
    expect(within(stage() as HTMLElement).getByRole('button', { name: /try again/i }))
      .toBeEnabled();
  });

  it('republishes nothing for a claim that already exists', async () => {
    // The user claimed under a build that had no ceremony. The act must reach
    // the same place without a second event.
    seed({
      paths: { ...ALL_DONE },
      status: 'completed',
      badgeClaim: { badge: 'ditto-explorer', status: 'claimed', claimEventId: 'x', claimedAt: 1 },
    });
    claim.mockResolvedValue({ status: 'already-claimed', claimEventId: 'x' });
    await openStage();
    fireEvent.click(revealButton()!);

    await waitFor(() => expect(stage()).toHaveAttribute('data-phase', 'revealing'), {
      timeout: 3_000,
    });
    expect(publishEvent).not.toHaveBeenCalled();
    // Nothing republished, and the reveal stamped on its own — the same
    // ceremony a fresh claim gets, not a lesser one.
    expect(markRewardRevealed).toHaveBeenCalledTimes(1);
    expect(stage()!.querySelector('[data-explorer-badge-image]')).not.toBeNull();
  });

  it('treats an in-flight claim as a wait, not a failure', async () => {
    ready();
    claim.mockResolvedValue({ status: 'in-flight' });
    await openStage();
    fireEvent.click(revealButton()!);

    await waitFor(() => expect(stage()).toHaveAttribute('data-phase', 'acting'));
    await new Promise((r) => setTimeout(r, CEREMONY_MIN_ACTING_MS + 300));
    // Still acting. Offering a retry here would start a second publish for a
    // claim that is already on its way.
    expect(stage()).toHaveAttribute('data-phase', 'acting');
    expect(within(stage() as HTMLElement).queryByText(/didn.t go through/i)).toBeNull();
  });

  it('falls back to the truth when the reward stops being claimable', async () => {
    ready();
    claim.mockResolvedValue({ status: 'ineligible', rewardView: 'locked' });
    await openStage();
    fireEvent.click(revealButton()!);

    await waitFor(() => expect(stage()).toHaveAttribute('data-phase', 'sealed'), {
      timeout: 3_000,
    });
    // Never a fabricated success, and never stuck.
    expect(within(stage() as HTMLElement).queryByText('Your claim is in.')).toBeNull();
    expect(revealButton()).toHaveTextContent(/reveal your reward/i);
  });

  it('lets the user leave while the claim is still running', async () => {
    ready();
    claim.mockImplementation(() => new Promise(() => {}));
    await openStage();
    fireEvent.click(revealButton()!);
    await waitFor(() => expect(stage()).toHaveAttribute('data-phase', 'acting'));

    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(stage()).toBeNull());

    // The publish belongs to the hook and carries on without a stage to watch
    // it; closing cancels nothing and fabricates nothing.
    expect(claim).toHaveBeenCalledTimes(1);
    expect(state?.badgeClaim?.revealedAt).toBeUndefined();
  });

  it('never reveals anything when the claim fails', async () => {
    ready();
    claim.mockResolvedValue({ status: 'failed', error: new Error('no') });
    await openStage();
    fireEvent.click(revealButton()!);

    await waitFor(() => expect(stage()).toHaveAttribute('data-phase', 'failed'), {
      timeout: 3_000,
    });
    // No stamp, no badge, no way to mistake a failure for a reward.
    expect(markRewardRevealed).not.toHaveBeenCalled();
    expect(state?.badgeClaim?.revealedAt).toBeUndefined();
    expect(stage()!.querySelector('[data-explorer-badge-image]')).toBeNull();
    expect(stage()!.querySelector('[data-sealed-reward-art]')).not.toBeNull();
  });

  it('stays revealed when the stage is closed mid-reveal', async () => {
    // The most important invariant: the animation is disposable, the timestamp
    // is not. `revealedAt` went down before the choreography started.
    ready();
    claim.mockResolvedValue({ status: 'claimed', claimEventId: 'e'.repeat(64) });
    await openStage();
    fireEvent.click(revealButton()!);
    await waitFor(() => expect(stage()).toHaveAttribute('data-phase', 'revealing'), {
      timeout: 3_000,
    });

    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(stage()).toBeNull());
    expect(claim).toHaveBeenCalledWith({ revealedAt: expect.any(Number) });
  });
});

/**
 * The ceremony pushes a history entry so Back can close it. If its owner goes
 * away while the stage is open, that entry must go too — otherwise the user is
 * left with a Back press that pops an entry for a ceremony that no longer
 * exists, at a URL identical to the one they are already on.
 */
describe('reward ceremony — history hygiene', () => {
  const ceremonyEntry = () =>
    screen.getByTestId('location').getAttribute('data-ceremony');

  it('takes its history entry with it when its owner unmounts', async () => {
    ready();
    const { rerender } = renderReward();
    fireEvent.click(openButton()!);
    await waitFor(() => expect(ceremonyEntry()).toBe('true'));

    // The panel disappears underneath the open stage: a route change, an
    // account switch, a parent that stops rendering the reward.
    rerender(
      <MemoryRouter initialEntries={['/missions']}>
        <Routes>
          <Route path="/missions" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(stage()).toBeNull());
    await waitFor(() => expect(ceremonyEntry()).toBe('false'));
  });

  it('keeps the whole URL, hash included', async () => {
    ready();
    render(
      <MemoryRouter initialEntries={['/missions?tab=x#reward']}>
        <Routes>
          <Route
            path="/missions"
            element={
              <>
                <LocationProbe />
                <MissionReward completedCount={4} totalCount={4} ceremonyOpenable />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(openButton()!);
    await waitFor(() => expect(stage()).not.toBeNull());

    // Dropping the hash would move the user off their anchor on the way in, and
    // again on the way back out.
    expect(screen.getByTestId('location').getAttribute('data-hash')).toBe('#reward');
    expect(screen.getByTestId('location').getAttribute('data-search')).toBe('?tab=x');
  });
});

/**
 * "Open Badges" means *take me to my badges*.
 *
 * It used to navigate to `/badges` bare, which leaves the tab to a session
 * preference that defaults to Follows — so the last step of the journey landed
 * on other people's badges. Both actions now name the tab in the URL, and both
 * name the *same* one, which is why they are asserted together.
 *
 * These assert the real navigation through a real router rather than a spy on
 * `navigate`: a spy would happily accept a destination the Badges page cannot
 * read. `badgesTabs.test.ts` closes the other half — that this URL parses back
 * to the My Badges tab.
 */
describe('reward ceremony — where Open Badges goes', () => {
  /** A router with somewhere to actually arrive, and a probe that outlives it. */
  function renderWithBadgesRoute(celebrating = false) {
    const openable = state
      ? isCeremonyOwed(state) &&
        rewardPresentation(badgeRewardView(state), celebrating) !== 'settling'
      : false;

    return render(
      <MemoryRouter initialEntries={['/missions']}>
        <LocationProbe />
        <Routes>
          <Route
            path="/missions"
            element={
              <MissionReward
                completedCount={4}
                totalCount={4}
                celebrating={celebrating}
                ceremonyOpenable={openable}
              />
            }
          />
          <Route path="/badges" element={<div data-testid="badges-page" />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  const location = () => screen.getByTestId('location');

  it('takes the settled ceremony to the My Badges tab', async () => {
    ready();
    claim.mockResolvedValue({ status: 'claimed', claimEventId: 'e'.repeat(64) });
    renderWithBadgesRoute();

    fireEvent.click(openButton()!);
    await waitFor(() => expect(stage()).not.toBeNull());
    fireEvent.click(revealButton()!);
    await waitFor(() => expect(stage()).toHaveAttribute('data-phase', 'settled'), {
      timeout: CEREMONY_REVEAL_MS + 3_000,
    });

    fireEvent.click(
      within(stage() as HTMLElement).getByRole('button', { name: /open badges/i }),
    );

    await waitFor(() => expect(location().getAttribute('data-pathname')).toBe('/badges'));
    expect(location().getAttribute('data-search')).toBe(`?${BADGES_TAB_PARAM}=mine`);
    expect(await screen.findByTestId('badges-page')).toBeInTheDocument();

    // The stage goes with them: no overlay left mounted over the destination.
    expect(stage()).toBeNull();

    // …and they *stay* there. The destination replaces the stage's history
    // entry rather than sitting on top of it, so the panel's unmount — which
    // runs a beat later, as the route changes — finds nothing left to pop. It
    // used to pop that entry and drop the user straight back onto the journey,
    // with Badges only flashing past. The wait is what makes this meaningful:
    // the cleanup defers its work, so an immediate assertion would pass either
    // way. See `useRewardCeremony.leave.test.tsx` for the mechanics a memory
    // history cannot show.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(location().getAttribute('data-pathname')).toBe('/badges');
    expect(location().getAttribute('data-search')).toBe(`?${BADGES_TAB_PARAM}=mine`);
    expect(location().getAttribute('data-ceremony')).toBe('false');
    expect(stage()).toBeNull();
  });

  it('takes the revealed reward panel to the same place', async () => {
    // The panel's own action, for someone returning to /missions afterwards.
    seed({
      paths: { ...ALL_DONE },
      status: 'completed',
      badgeClaim: {
        badge: 'ditto-explorer',
        status: 'claimed',
        claimEventId: 'e'.repeat(64),
        claimedAt: 1,
        revealedAt: 2,
      },
    });
    renderWithBadgesRoute();

    fireEvent.click(screen.getByRole('button', { name: /open badges/i }));

    await waitFor(() => expect(location().getAttribute('data-pathname')).toBe('/badges'));
    expect(location().getAttribute('data-search')).toBe(`?${BADGES_TAB_PARAM}=mine`);
  });

  it('is an ordinary router navigation, so Back returns to the journey', async () => {
    seed({
      paths: { ...ALL_DONE },
      status: 'completed',
      badgeClaim: {
        badge: 'ditto-explorer',
        status: 'claimed',
        claimEventId: 'e'.repeat(64),
        claimedAt: 1,
        revealedAt: 2,
      },
    });
    renderWithBadgesRoute();

    fireEvent.click(screen.getByRole('button', { name: /open badges/i }));
    await waitFor(() => expect(location().getAttribute('data-pathname')).toBe('/badges'));

    fireEvent.click(screen.getByRole('button', { name: /browser back/i }));
    await waitFor(() => expect(location().getAttribute('data-pathname')).toBe('/missions'));
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

/**
 * How the reward's call to action is shaped.
 *
 * jsdom has no layout, so these assert the decisions rather than the pixels —
 * which is the point: the button was cramped because of the classes it carried,
 * not because of a measurement.
 *
 * It shipped as `size="sm"` (`h-9`, `px-3`) inside a `rounded-full` pill. A pill
 * that tall curves over ~18px at each end, so 12px of padding put the first and
 * last glyphs inside the curve, and `Button`'s base `whitespace-nowrap` meant
 * any longer label — every translation of "Reveal your reward" is longer — left
 * through the ends rather than wrapping.
 */
describe('reward call to action — shape', () => {
  it('lets a longer label wrap instead of running out of the pill', () => {
    ready();
    renderReward();
    const button = openButton()!;
    expect(button.className).toContain('whitespace-normal');
    expect(button.className).not.toContain('whitespace-nowrap');
    // A wrapped label needs somewhere to go, so the height cannot be fixed.
    expect(button.className).toContain('h-auto');
  });

  it('clears its own radius, so the text is not jammed against the curve', () => {
    ready();
    renderReward();
    const button = openButton()!;
    expect(button.className).toContain('px-6');
    expect(button.className).not.toContain('px-3');
  });

  it('is a real touch target on the page a phone reaches it from', () => {
    ready();
    renderReward();
    // `min-h-11` is 44px. It was `h-9` (36px) — under the minimum, for the last
    // and most consequential step of the journey.
    expect(openButton()!.className).toContain('min-h-11');
  });

  it('the stage\u2019s own act is shaped the same way', async () => {
    ready();
    renderReward();
    fireEvent.click(openButton()!);
    await waitFor(() => expect(revealButton()).not.toBeNull());
    const button = revealButton()!;
    expect(button.className).toContain('whitespace-normal');
    expect(button.className).toContain('h-auto');
    expect(button.className).toContain('min-h-11');
  });
});
