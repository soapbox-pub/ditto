import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';

import { FirstArrivalExperience } from './FirstArrivalExperience';
import { STAGE_TIMINGS } from '@/hooks/useArrivalStage';
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
    registerTarget: vi.fn(),
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
const backdrop = () => document.querySelector('[data-arrival-backdrop]');

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
    expect(welcome()).not.toBeInTheDocument();
    expect(intro()).toBeInTheDocument();
  });

  it('fades the welcome out in an act of its own', () => {
    renderArrival();
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.welcome));
    expect(isFaded(welcome())).toBe(true);
    expect(intro()).not.toBeInTheDocument();
  });

  it('introduces the card with framing copy rather than on its own', () => {
    renderArrival();
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.welcomeOut));

    expect(screen.getByText('Let’s get you started')).toBeInTheDocument();
    expect(
      screen.getByText(/Find people, make Ditto yours, and take your first steps/),
    ).toBeInTheDocument();
    expect(card()).toBeInTheDocument();
  });

  it('keeps the framing copy outside the travelling element', () => {
    // Only the card travels. If the heading were a child it would be dragged
    // into the sidebar with it.
    renderArrival();
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.welcomeOut));
    expect(card()!.contains(intro())).toBe(false);
  });

  it('does not stack two copies of the mission name or its headline', () => {
    renderArrival();
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.welcomeOut));
    expect(screen.getAllByText('Ditto Explorer')).toHaveLength(1);
    expect(screen.getAllByText(/Your first journey through Ditto is ready/)).toHaveLength(1);
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

  it('removes the framing copy before the card starts moving', () => {
    const { rerender } = renderArrival();
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.welcomeOut));

    phase = 'revealing';
    rerender(
      <IntlProvider locale="en">
        <FirstArrivalExperience />
      </IntlProvider>,
    );
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.prepareAfterReveal));

    expect(isFaded(intro())).toBe(true);
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
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.welcomeOut));
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

    act(() => void vi.advanceTimersByTime(1_000));
    expect(welcome()).not.toBeInTheDocument();
    expect(intro()).toBeInTheDocument();
    // Crossfade, not motion.
    expect(card()!.className).not.toContain('arrival-card-in');
  });

  it('crossfades the backdrop under reduced motion instead of stepping it', () => {
    reducedMotion = true;
    phase = 'revealing';
    renderArrival();
    expect(backdrop()!.className).toContain('opacity-0');
    expect(backdrop()!.className).not.toContain('arrival-backdrop-out');
  });
});
