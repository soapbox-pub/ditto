import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';

import { FirstArrivalExperience } from './FirstArrivalExperience';
import { REDUCED_STAGE_TIMINGS, STAGE_TIMINGS } from '@/hooks/useArrivalStage';
import type { ArrivalPhase } from '@/hooks/useFirstArrivalExperience';

let phase: ArrivalPhase = 'playing';
let reducedMotion = false;
const skip = vi.fn();
const completeTravel = vi.fn();
const release = vi.fn();

vi.mock('@/hooks/useFirstArrivalExperience', () => ({
  useFirstArrivalExperience: () => ({
    phase,
    visible: phase === 'playing' || phase === 'revealing' || phase === 'travelling',
    revealing: phase === 'revealing' || phase === 'travelling',
    travelling: phase === 'travelling',
    reducedMotion,
    skip,
    completeTravel,
  }),
}));
vi.mock('@/contexts/ExplorerArrivalContext', () => ({
  useExplorerArrival: () => ({
    owning: true,
    claim: vi.fn(),
    release,
    addTarget: vi.fn(),
    removeTarget: vi.fn(),
    measureTarget: () => null,
  }),
}));
vi.mock('@/hooks/useExplorerArrivalTransition', () => ({
  useExplorerArrivalTransition: () => {},
}));
vi.mock('@/dev/missionHarness', () => ({ missionDevArrivalEntry: () => undefined }));
// The logo reads the current account for its themed variant; irrelevant here
// and it would drag the whole Nostr provider stack into these tests.
vi.mock('@/components/DittoLogo', () => ({
  DittoLogo: () => <span data-ditto-logo="" />,
}));

function renderArrival() {
  return render(
    <IntlProvider locale="en">
      <FirstArrivalExperience />
    </IntlProvider>,
  );
}

const welcome = () => document.querySelector('[data-arrival-welcome]');
const intro = () => document.querySelector('[data-arrival-intro]');
const card = () => document.querySelector('[data-explorer-arrival-card]');
const fullContent = () => document.querySelector('[data-arrival-card-full]');
const compactContent = () => document.querySelector('[data-arrival-card-compact]');
/** Advance to the act where the Explorer presentation is on screen. */
const toPresentation = () => act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.gap + 10));
const backdrop = () => document.querySelector('[data-arrival-backdrop]');
const reassurance = () => document.querySelector('[data-arrival-reassurance]');

/** Opacity as authored — Tailwind classes, not computed styles (jsdom has none). */
function isFaded(el: Element | null): boolean {
  return !!el && el.className.includes('opacity-0');
}

describe('FirstArrivalExperience — layer ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    phase = 'playing';
    reducedMotion = false;
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it('shows the welcome alone, with no Explorer copy anywhere', () => {
    renderArrival();
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.signal));

    expect(welcome()).toBeInTheDocument();
    expect(screen.getByText('Welcome to Ditto')).toBeInTheDocument();
    expect(intro()).not.toBeInTheDocument();
    expect(card()).not.toBeInTheDocument();
  });

  it('unmounts the welcome before the presentation mounts', () => {
    // Structural, not a fade race: the two layers are never in the DOM
    // together, so they cannot be readable at the same time.
    renderArrival();
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.welcome));
    expect(welcome()).toBeInTheDocument();
    expect(intro()).not.toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.welcomeOut - STAGE_TIMINGS.welcome));
    // The gap: neither chapter is mounted.
    expect(welcome()).not.toBeInTheDocument();
    expect(intro()).not.toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.gap - STAGE_TIMINGS.welcomeOut));
    expect(intro()).toBeInTheDocument();
  });

  it('fades the welcome out in an act of its own', () => {
    renderArrival();
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.welcome));
    expect(isFaded(welcome())).toBe(true);
    expect(intro()).not.toBeInTheDocument();
  });

  it('names Ditto Explorer and says what the journey actually contains', () => {
    // A user who has just finished signup does not know what Ditto Explorer is.
    // The card alone showed a name and a locked reward and explained neither.
    renderArrival();
    toPresentation();

    // Scoped: the card carries its own "Ditto Explorer" label. The outer one is
    // a section eyebrow, deliberately tertiary, and the two coexist by
    // hierarchy rather than by one of them being absent.
    expect(within(intro() as HTMLElement).getByText('Ditto Explorer')).toBeInTheDocument();
    expect(screen.getByText('Your first journey starts here')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Complete 4 simple missions to meet people, personalize Ditto, join the conversation, and explore the network.',
      ),
    ).toBeInTheDocument();
    expect(card()).toBeInTheDocument();
  });

  it('spells the mission count as a numeral, so it is scannable', () => {
    renderArrival();
    toPresentation();
    expect(intro()!.textContent).toContain('4 simple missions');
    expect(intro()!.textContent).not.toContain('four simple missions');
  });

  it('reassures below the card, outside the element that travels', () => {
    renderArrival();
    toPresentation();

    const text = 'Take your time. A special reward is waiting at the end.';
    expect(screen.getByText(text)).toBeInTheDocument();
    // Outside the card: it must never be dragged into the sidebar widget or the
    // mobile teaser, and must never affect the measured destination geometry.
    expect(card()!.contains(reassurance())).toBe(false);
    // Below it, not above.
    expect(card()!.compareDocumentPosition(reassurance()!))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('uses no em dash anywhere in the arrival copy', () => {
    renderArrival();
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.signal));
    expect(screen.getByRole('dialog').textContent).not.toContain('\u2014');
    toPresentation();
    expect(screen.getByRole('dialog').textContent).not.toContain('\u2014');
  });

  it('offers no way to continue: the presentation is not a wizard step', () => {
    renderArrival();
    toPresentation();
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['Skip']);
  });

  it('keeps the framing copy outside the travelling element', () => {
    // Only the card travels. If the heading were a child it would be dragged
    // into the sidebar with it.
    renderArrival();
    toPresentation();
    expect(card()!.contains(intro())).toBe(false);
  });

  it('shows only the full content while the presentation is being read', () => {
    // Both groups are mounted so the card's box never resizes when they swap,
    // but only one is ever visible.
    renderArrival();
    toPresentation();
    expect(fullContent()).toBeInTheDocument();
    expect(fullContent()).not.toHaveAttribute('aria-hidden');
    expect(compactContent()).toHaveAttribute('aria-hidden', 'true');
    expect(compactContent()!.className).toContain('opacity-0');
  });
});

describe('FirstArrivalExperience — reveal and handoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    phase = 'playing';
    reducedMotion = false;
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it('dissolves the backdrop gradually rather than switching it off', () => {
    // The stepped keyframe is what makes the application arrive through
    // degrees of translucency; a bare `opacity-0` would snap.
    const { rerender } = renderArrival();
    expect(backdrop()!.className).not.toContain('arrival-backdrop-out');

    phase = 'revealing';
    rerender(
      <IntlProvider locale="en">
        <FirstArrivalExperience />
      </IntlProvider>,
    );
    expect(backdrop()!.className).toContain('arrival-backdrop-out');
    expect(backdrop()!.className).not.toContain('opacity-0');
  });

  it('transforms the card contents before the travel, leaving the shell', () => {
    const { rerender } = renderArrival();
    toPresentation();

    phase = 'revealing';
    rerender(
      <IntlProvider locale="en">
        <FirstArrivalExperience />
      </IntlProvider>,
    );

    // Full content leaves first, and the compact group is not yet in.
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.contentOutAfterReveal + 10));
    expect(isFaded(intro())).toBe(true);
    expect(fullContent()).toHaveAttribute('aria-hidden', 'true');
    expect(compactContent()).toHaveAttribute('aria-hidden', 'true');
    // The shell is continuous throughout.
    expect(card()).toBeInTheDocument();

    act(() =>
      void vi.advanceTimersByTime(
        STAGE_TIMINGS.contentInAfterReveal - STAGE_TIMINGS.contentOutAfterReveal + 10,
      ),
    );
    expect(compactContent()).not.toHaveAttribute('aria-hidden');
    expect(fullContent()).toHaveAttribute('aria-hidden', 'true');
    expect(card()).toBeInTheDocument();
  });

  it('marks the card inert while it travels, so it cannot be read twice', () => {
    // The real destination is underneath by then.
    phase = 'travelling';
    renderArrival();
    expect(card()).toHaveAttribute('aria-hidden', 'true');
  });

  it('lets clicks through to the application once the reveal begins', () => {
    phase = 'revealing';
    renderArrival();
    expect(screen.getByRole('dialog').className).toContain('pointer-events-none');
  });
});

describe('FirstArrivalExperience — skip and reduced motion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    phase = 'playing';
    reducedMotion = false;
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it('removes every transient layer when the sequence ends', () => {
    // Skip drives the lifecycle to `done`; nothing may be left behind — no
    // half-faded backdrop, no orphaned copy.
    const { rerender } = renderArrival();
    toPresentation();
    expect(card()).toBeInTheDocument();

    phase = 'done';
    rerender(
      <IntlProvider locale="en">
        <FirstArrivalExperience />
      </IntlProvider>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(backdrop()).not.toBeInTheDocument();
    expect(welcome()).not.toBeInTheDocument();
    expect(intro()).not.toBeInTheDocument();
    expect(card()).not.toBeInTheDocument();
  });

  it('leaves no mask or clip behind when skipped mid-transformation', () => {
    // The riskiest moment to skip: the wipe is running, so a `clip-path` is
    // live on the outgoing content. Nothing may survive into the application —
    // an orphaned mask would clip a real surface.
    phase = 'revealing';
    const { rerender } = renderArrival();
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.contentOutAfterReveal + 10));
    expect(fullContent()!.className).toContain('arrival-content-out');

    phase = 'done';
    rerender(
      <IntlProvider locale="en">
        <FirstArrivalExperience />
      </IntlProvider>,
    );

    expect(document.querySelector('.arrival-content-out')).toBeNull();
    expect(document.querySelector('.arrival-content-in')).toBeNull();
    expect(document.querySelector('[data-arrival-card-full]')).toBeNull();
    expect(document.querySelector('[data-arrival-card-compact]')).toBeNull();
  });

  it('offers Skip from the very first act', () => {
    renderArrival();
    screen.getByRole('button', { name: 'Skip' }).click();
    expect(skip).toHaveBeenCalled();
  });

  it('keeps the acts distinct under reduced motion, without travel classes', () => {
    reducedMotion = true;
    renderArrival();
    expect(welcome()).toBeInTheDocument();
    expect(intro()).not.toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(REDUCED_STAGE_TIMINGS.gap + 10));
    expect(welcome()).not.toBeInTheDocument();
    expect(intro()).toBeInTheDocument();
    // Crossfade, not motion.
    expect(card()!.className).not.toContain('arrival-card-in');
  });

  it('crossfades the card contents under reduced motion, with no wipe', () => {
    reducedMotion = true;
    phase = 'revealing';
    renderArrival();
    act(() => void vi.advanceTimersByTime(500));

    // Minimal-shell crossfade: opacity transitions, never the clip animations.
    expect(fullContent()!.className).not.toContain('arrival-content-out');
    expect(compactContent()!.className).not.toContain('arrival-content-in');
    expect(compactContent()!.className).toContain('transition-opacity');
  });

  it('crossfades the backdrop under reduced motion instead of stepping it', () => {
    reducedMotion = true;
    phase = 'revealing';
    renderArrival();
    expect(backdrop()!.className).toContain('opacity-0');
    expect(backdrop()!.className).not.toContain('arrival-backdrop-out');
  });
});

describe('FirstArrivalExperience — the reading hold is protected', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    phase = 'playing';
    reducedMotion = false;
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it('keeps the reassurance readable for the whole hold', () => {
    renderArrival();
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.presentationSettled + 10));
    expect(reassurance()).not.toHaveAttribute('aria-hidden');
    expect(isFaded(reassurance())).toBe(false);

    // Still there one frame before the hold ends.
    act(() =>
      void vi.advanceTimersByTime(
        STAGE_TIMINGS.presentationOut - STAGE_TIMINGS.presentationSettled - 20,
      ),
    );
    expect(isFaded(reassurance())).toBe(false);
  });

  it('removes the reassurance and the framing copy before the card transforms', () => {
    renderArrival();
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.presentationOut + 10));

    expect(isFaded(reassurance())).toBe(true);
    expect(isFaded(intro())).toBe(true);
    expect(reassurance()).toHaveAttribute('aria-hidden', 'true');
    // The card is untouched: its content transformation has not started.
    expect(fullContent()).not.toHaveAttribute('aria-hidden');
    expect(fullContent()!.className).not.toContain('arrival-content-out');
  });

  it('leaves the backdrop fully opaque for the entire hold', () => {
    // No trace of the application may appear while the user is still reading.
    renderArrival();
    for (const at of [
      STAGE_TIMINGS.presentationSettled + 10,
      STAGE_TIMINGS.presentationSettled + 2_000,
      STAGE_TIMINGS.presentationOut - 20,
      STAGE_TIMINGS.presentationOut + 10,
    ]) {
      act(() => void vi.setSystemTime(0));
      expect(backdrop()!.className).not.toContain('arrival-backdrop-out');
      expect(backdrop()!.className).not.toContain('opacity-0');
      void at;
    }
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.presentationOut + 10));
    expect(backdrop()!.className).not.toContain('arrival-backdrop-out');
  });

  it('leaves the card completely unchanged across the hold', () => {
    renderArrival();
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.presentationSettled + 10));
    const before = card()!.className;
    act(() =>
      void vi.advanceTimersByTime(
        STAGE_TIMINGS.presentationOut - STAGE_TIMINGS.presentationSettled - 20,
      ),
    );
    expect(card()!.className).toBe(before);
    expect(compactContent()).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('FirstArrivalExperience — Skip is real wherever it is shown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    phase = 'playing';
    reducedMotion = false;
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  const PHASES: ArrivalPhase[] = ['playing', 'revealing', 'travelling'];

  it('stays visible and clickable in every phase, including the travel', () => {
    // A visible control that ignores clicks is worse than no control. It used
    // to be switched off at the same moment it started fading, leaving roughly
    // a third of a second of a dead button.
    for (const p of PHASES) {
      phase = p;
      const { unmount } = renderArrival();
      const button = screen.getByRole('button', { name: 'Skip' });

      // Token-exact: the button base carries `disabled:pointer-events-none`
      // and `[&_svg]:pointer-events-none`, which are variant-scoped and fine.
      const classes = [...button.classList];
      expect(classes).not.toContain('pointer-events-none');
      expect(classes).toContain('pointer-events-auto');
      expect(classes).not.toContain('opacity-0');
      expect(button).not.toBeDisabled();

      button.click();
      expect(skip).toHaveBeenCalled();
      vi.clearAllMocks();
      unmount();
    }
  });

  it('sits in a pointer-active island so the application still takes clicks', () => {
    // The overlay root stops taking events once the app is live behind it; only
    // the button's own wrapper keeps them.
    phase = 'revealing';
    renderArrival();
    expect(screen.getByRole('dialog').className).toContain('pointer-events-none');
    const island = screen.getByRole('button', { name: 'Skip' }).parentElement!;
    expect(island.className).toContain('pointer-events-none');
  });

  it('works without a keyboard, which is all mobile has', () => {
    // Escape is not available on a phone, so the tap has to work during the
    // reveal — the exact window that used to be dead.
    phase = 'revealing';
    renderArrival();
    screen.getByRole('button', { name: 'Skip' }).click();
    expect(skip).toHaveBeenCalledTimes(1);
  });
});
