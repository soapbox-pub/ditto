import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRef, type ReactNode } from 'react';

import {
  CROSSFADE_MS,
  useExplorerArrivalTransition,
} from './useExplorerArrivalTransition';
// The movement itself is shared with the reward ceremony and lives in a neutral
// module; the hook around it is the arrival's own.
import { travelDurationFor } from '@/lib/sharedElementTravel';
import { ExplorerArrivalProvider } from '@/components/ExplorerArrivalProvider';
import { ExplorerArrivalContext } from '@/contexts/ExplorerArrivalContext';

/** Give an element a stable, fake layout box — jsdom reports zeros. */
function stubRect(el: HTMLElement, rect: Partial<DOMRect>) {
  const full = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, ...rect };
  el.getBoundingClientRect = () => ({ ...full, toJSON: () => full }) as DOMRect;
}

function makeCard(rect: Partial<DOMRect>) {
  const card = document.createElement('div');
  stubRect(card, rect);
  document.body.appendChild(card);
  return card;
}

/**
 * Drive the transition with a controllable coordinator, so measurement and
 * release can be observed directly.
 */
function renderTransition({
  card,
  measureTarget,
  active = true,
}: {
  card: HTMLElement | null;
  measureTarget: () => DOMRect | null;
  active?: boolean;
}) {
  const onComplete = vi.fn();
  const release = vi.fn();
  const value = {
    owning: true,
    claim: vi.fn(),
    release,
    registerTarget: vi.fn(),
    measureTarget,
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ExplorerArrivalContext.Provider value={value}>{children}</ExplorerArrivalContext.Provider>
  );
  const view = renderHook(
    () => {
      const ref = useRef<HTMLElement | null>(card);
      useExplorerArrivalTransition({ cardRef: ref, active, onComplete });
      return null;
    },
    { wrapper },
  );
  return { ...view, onComplete, release };
}

const TARGET: DOMRect = {
  x: 1000, y: 10, top: 10, left: 1000, right: 1284, bottom: 260,
  width: 284, height: 250, toJSON: () => ({}),
} as DOMRect;

describe('useExplorerArrivalTransition', () => {
  beforeEach(() => {
    // Vitest's fake timers fake requestAnimationFrame too, so advancing time
    // drives the frame loop deterministically.
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('does nothing at all while inactive', () => {
    const measureTarget = vi.fn(() => TARGET);
    const { onComplete, release } = renderTransition({
      card: makeCard({ width: 350, height: 400, top: 200, left: 500 }),
      measureTarget,
      active: false,
    });

    act(() => void vi.advanceTimersByTime(2_000));
    expect(measureTarget).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it('measures the real destination rather than assuming coordinates', () => {
    const measureTarget = vi.fn(() => TARGET);
    renderTransition({
      card: makeCard({ width: 350, height: 400, top: 200, left: 500 }),
      measureTarget,
    });

    act(() => void vi.advanceTimersByTime(100));
    expect(measureTarget).toHaveBeenCalled();
  });

  it('lands the card on the measured destination', () => {
    const card = makeCard({ width: 350, height: 400, top: 200, left: 500 });
    const { onComplete } = renderTransition({ card, measureTarget: () => TARGET });

    act(() => void vi.advanceTimersByTime(2_000));

    // Pinned out of flow at its origin, then translated by exactly the offset
    // to the destination and scaled to its width.
    expect(card.style.position).toBe('fixed');
    expect(card.style.transform).toContain(`translate(${TARGET.left - 500}px, ${TARGET.top - 200}px)`);
    expect(card.style.transform).toContain(`scale(${TARGET.width / 350})`);
    expect(onComplete).toHaveBeenCalled();
  });

  it('collapses the card toward the destination height, not just its width', () => {
    // The mobile teaser is a short strip; a width-matched card would still be
    // covering the feed at handoff.
    const card = makeCard({ width: 350, height: 400, top: 200, left: 20 });
    const teaser = { ...TARGET, left: 16, top: 435, width: 358, height: 56 } as DOMRect;
    renderTransition({ card, measureTarget: () => teaser });

    act(() => void vi.advanceTimersByTime(2_000));
    const scale = teaser.width / 350;
    expect(Number.parseFloat(card.style.height)).toBeCloseTo(teaser.height / scale, 0);
  });

  it('re-measures each frame, so a destination that moves is still hit', () => {
    // The app was revealed moments ago and is still settling — a feed finishing
    // its first load can move the teaser mid-flight.
    const card = makeCard({ width: 350, height: 400, top: 200, left: 20 });
    let rect = { ...TARGET, left: 16, top: 900, width: 358, height: 56 } as DOMRect;
    const measureTarget = vi.fn(() => rect);
    renderTransition({ card, measureTarget });

    act(() => void vi.advanceTimersByTime(200));
    rect = { ...rect, top: 435 } as DOMRect; // content loaded; teaser moved up
    act(() => void vi.advanceTimersByTime(2_000));

    expect(card.style.transform).toContain(`translate(${16 - 20}px, ${435 - 200}px)`);
    expect(measureTarget.mock.calls.length).toBeGreaterThan(3);
  });

  it('falls back to shrinking in place when there is no destination', () => {
    // Suppressed on /missions, unmounted by a route change, or scrolled off
    // screen — never fly toward somewhere the user cannot see.
    const card = makeCard({ width: 350, height: 400, top: 200, left: 500 });
    const { onComplete } = renderTransition({ card, measureTarget: () => null });

    act(() => void vi.advanceTimersByTime(2_000));

    expect(card.style.transform).toMatch(/^scale\(/);
    expect(card.style.transform).not.toContain('translate');
    expect(onComplete).toHaveBeenCalled();
  });

  it('reveals the destination before the card has finished fading', () => {
    const card = makeCard({ width: 350, height: 400, top: 200, left: 500 });
    const { release, onComplete } = renderTransition({ card, measureTarget: () => TARGET });

    act(() => void vi.advanceTimersByTime(800)); // past the handoff point
    expect(release).toHaveBeenCalled();
    // …and the card is still on screen, fading over its aligned destination.
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('hands over immediately when there is no card to animate', () => {
    const { onComplete, release } = renderTransition({ card: null, measureTarget: () => TARGET });
    expect(release).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
  });

  it('hands over immediately when the card has no measurable geometry', () => {
    const { onComplete } = renderTransition({
      card: makeCard({ width: 0, height: 0 }),
      measureTarget: () => TARGET,
    });
    expect(onComplete).toHaveBeenCalled();
  });

  it('releases the destination if the transition is interrupted', () => {
    // A route change or unmount mid-flight must never leave the Explorer
    // surface permanently invisible.
    const card = makeCard({ width: 350, height: 400, top: 200, left: 500 });
    const { unmount, release } = renderTransition({ card, measureTarget: () => TARGET });

    act(() => void vi.advanceTimersByTime(100));
    release.mockClear();
    unmount();

    expect(release).toHaveBeenCalled();
  });

  it('leaves no animation styles behind after an interruption', () => {
    const card = makeCard({ width: 350, height: 400, top: 200, left: 500 });
    const { unmount } = renderTransition({ card, measureTarget: () => TARGET });

    act(() => void vi.advanceTimersByTime(200));
    unmount();

    for (const prop of ['position', 'left', 'top', 'width', 'height', 'transform', 'opacity']) {
      expect(card.style.getPropertyValue(prop)).toBe('');
    }
  });
});

describe('ExplorerArrivalProvider measurement', () => {
  function renderProvider() {
    return renderHook(() => null, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ExplorerArrivalProvider>{children}</ExplorerArrivalProvider>
      ),
    });
  }

  it('starts un-owned, so a refresh can never leave the surface hidden', () => {
    // Ownership is in-memory on purpose: whatever happened to a previous run,
    // a fresh load shows the destination.
    let owning: boolean | undefined;
    renderHook(
      () => {
        owning = ExplorerArrivalContextValue().owning;
        return null;
      },
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <ExplorerArrivalProvider>{children}</ExplorerArrivalProvider>
        ),
      },
    );
    expect(owning).toBe(false);
  });

  it('renders without throwing', () => {
    expect(() => renderProvider()).not.toThrow();
  });
});

// Small helper so the test above can read the context without importing the
// hook module twice.
import { useExplorerArrival } from '@/contexts/ExplorerArrivalContext';
function ExplorerArrivalContextValue() {
  return useExplorerArrival();
}

describe('useExplorerArrivalTransition — aligned handoff', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('reveals the destination only once the card has actually arrived', () => {
    // Previously the crossfade began at a fixed 78% of the travel, while the
    // card was still ~11px short — so the two were visibly offset at the moment
    // they were meant to be indistinguishable.
    const card = makeCard({ width: 350, height: 400, top: 200, left: 500 });
    const { release } = renderTransition({ card, measureTarget: () => TARGET });

    // Part-way through: not yet arrived, so nothing has been handed over.
    act(() => void vi.advanceTimersByTime(200));
    const dx = TARGET.left - 500;
    const translated = Number(
      /translate\((-?[\d.]+)px/.exec(card.style.transform)?.[1] ?? '0',
    );
    expect(Math.abs(translated)).toBeLessThan(Math.abs(dx));
    expect(release).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(2_000));
    expect(release).toHaveBeenCalled();
  });

  it('holds the card on the destination while it crossfades', () => {
    const card = makeCard({ width: 350, height: 400, top: 200, left: 500 });
    const { onComplete } = renderTransition({ card, measureTarget: () => TARGET });

    act(() => void vi.advanceTimersByTime(2_000));

    // Landed exactly, and finished only after the crossfade.
    expect(card.style.transform).toContain(
      `translate(${TARGET.left - 500}px, ${TARGET.top - 200}px)`,
    );
    expect(onComplete).toHaveBeenCalled();
  });

  it('crossfades for a brief, deliberate window rather than a snap', () => {
    expect(CROSSFADE_MS).toBeGreaterThanOrEqual(120);
    expect(CROSSFADE_MS).toBeLessThanOrEqual(180);
  });

  it('paces the travel by distance, so a short hop is not a long journey', () => {
    // Mobile drops ~220px into the Home teaser; desktop crosses ~570px into the
    // sidebar. A single duration made one of them wrong.
    const shortHop = travelDurationFor(220);
    const longHop = travelDurationFor(570);
    expect(shortHop).toBeLessThan(longHop);
    expect(shortHop).toBeGreaterThanOrEqual(600);
    expect(longHop).toBeLessThanOrEqual(900);
  });

  it('clamps the pace at both ends', () => {
    expect(travelDurationFor(0)).toBeGreaterThanOrEqual(600);
    expect(travelDurationFor(10_000)).toBeLessThanOrEqual(900);
  });
});
