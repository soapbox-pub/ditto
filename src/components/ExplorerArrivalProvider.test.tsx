import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';

import { ExplorerArrivalProvider } from './ExplorerArrivalProvider';
import { ExplorerTransitionTarget } from './ExplorerTransitionTarget';
import { useExplorerArrival } from '@/contexts/ExplorerArrivalContext';

/**
 * Where the arrival card is allowed to land.
 *
 * The regression: the provider held **one** destination slot, and two Explorer
 * surfaces register into it — the desktop sidebar widget and the mobile Home
 * teaser, which is hidden with `lg:hidden` and so is still mounted, and still
 * registering, on a desktop layout. Whichever attached its ref last won. When
 * that was the CSS-hidden teaser the card measured nothing (a `display: none`
 * element reports a zero box), took the "no destination" fallback, and shrank in
 * place in the middle of the screen — the mobile-shaped ending, on desktop.
 *
 * The destination is now chosen from layout at measurement time, so these are
 * written the way the bug was found: by what is on screen, never by mount order
 * and never by a viewport width.
 */

/** jsdom reports zeros; give an element a real box (or a hidden one). */
function box(el: HTMLElement, rect: Partial<DOMRect> | null) {
  const full = rect
    ? { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, ...rect }
    : { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  el.getBoundingClientRect = () => ({ ...full, toJSON: () => full }) as DOMRect;
}

/** What `display: none` (i.e. `lg:hidden` at the wrong width) actually measures. */
const HIDDEN = null;

const SIDEBAR = { left: 1000, top: 12, width: 284, height: 250, right: 1284, bottom: 262 };
const TEASER = { left: 16, top: 520, width: 358, height: 56, right: 374, bottom: 576 };

let measure: () => DOMRect | null = () => null;

function Probe() {
  const { measureTarget } = useExplorerArrival();
  useEffect(() => {
    measure = measureTarget;
  }, [measureTarget]);
  return null;
}

function Surfaces({
  desktop,
  mobile,
}: {
  desktop?: Partial<DOMRect> | null;
  mobile?: Partial<DOMRect> | null;
}) {
  return (
    <ExplorerArrivalProvider>
      <Probe />
      {/* Mounted first, like the Home feed's teaser, which sits above the
          widget sidebar in the tree. */}
      {mobile !== undefined && (
        <ExplorerTransitionTarget>
          <p data-rect={JSON.stringify(mobile)}>Mobile teaser</p>
        </ExplorerTransitionTarget>
      )}
      {desktop !== undefined && (
        <ExplorerTransitionTarget>
          <p data-rect={JSON.stringify(desktop)}>Desktop widget</p>
        </ExplorerTransitionTarget>
      )}
    </ExplorerArrivalProvider>
  );
}

/** Apply the intended boxes to whichever surfaces are on screen. */
function layout({
  desktop,
  mobile,
}: {
  desktop?: Partial<DOMRect> | null;
  mobile?: Partial<DOMRect> | null;
}) {
  const desktopEl = screen.queryByText('Desktop widget')?.parentElement;
  const mobileEl = screen.queryByText('Mobile teaser')?.parentElement;
  if (desktopEl) box(desktopEl, desktop ?? HIDDEN);
  if (mobileEl) box(mobileEl, mobile ?? HIDDEN);
}

function viewport(width: number, height = 900) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

afterEach(() => {
  measure = () => null;
  viewport(1024, 768);
});

describe('ExplorerArrivalProvider — choosing the destination', () => {
  it('flies to the desktop widget when the desktop layout is active', () => {
    viewport(1440);
    render(<Surfaces desktop={SIDEBAR} mobile={HIDDEN} />);
    layout({ desktop: SIDEBAR, mobile: HIDDEN });

    // Not "the last one registered" — the one the user can actually see.
    expect(measure()?.left).toBe(SIDEBAR.left);
    expect(measure()?.width).toBe(SIDEBAR.width);
  });

  it('is not decided by which surface registered last', () => {
    // The mobile teaser deliberately mounts *after* the desktop widget here,
    // which is exactly the order that used to hand it the slot.
    viewport(1440);
    const { rerender } = render(<Surfaces desktop={SIDEBAR} />);
    layout({ desktop: SIDEBAR });
    rerender(<Surfaces desktop={SIDEBAR} mobile={HIDDEN} />);
    layout({ desktop: SIDEBAR, mobile: HIDDEN });

    expect(measure()?.left).toBe(SIDEBAR.left);
  });

  it('a CSS-hidden surface unmounting does not cancel the visible one', () => {
    // One shared slot meant any target's unmount cleared it, whoever owned it.
    viewport(1440);
    const { rerender } = render(<Surfaces desktop={SIDEBAR} mobile={HIDDEN} />);
    layout({ desktop: SIDEBAR, mobile: HIDDEN });

    rerender(<Surfaces desktop={SIDEBAR} />);
    layout({ desktop: SIDEBAR });

    expect(measure()?.left).toBe(SIDEBAR.left);
  });

  it('flies to the mobile teaser on a mobile layout', () => {
    viewport(390, 780);
    // Below `lg` the widget sidebar is not mounted at all (MainLayout gates it
    // on a media query), so the teaser is the only candidate.
    render(<Surfaces mobile={TEASER} />);
    layout({ mobile: TEASER });

    expect(measure()?.left).toBe(TEASER.left);
    expect(measure()?.height).toBe(TEASER.height);
  });

  it('follows a resize across the breakpoint with nothing remounting', () => {
    // The reported trigger: resizing while the card is in the air. Only CSS
    // changes, so no ref re-attaches — the answer has to come from measurement.
    render(<Surfaces desktop={SIDEBAR} mobile={HIDDEN} />);

    viewport(1440);
    layout({ desktop: SIDEBAR, mobile: HIDDEN });
    expect(measure()?.left).toBe(SIDEBAR.left);

    // Narrow: the sidebar collapses away, the teaser gets its box back.
    viewport(390, 780);
    layout({ desktop: HIDDEN, mobile: TEASER });
    expect(measure()?.left).toBe(TEASER.left);

    // ...and back. The card re-measures every frame, so it simply retargets.
    viewport(1440);
    layout({ desktop: SIDEBAR, mobile: HIDDEN });
    expect(measure()?.left).toBe(SIDEBAR.left);
  });

  it('never measures a detached element', () => {
    viewport(1440);
    const { rerender } = render(<Surfaces desktop={SIDEBAR} />);
    layout({ desktop: SIDEBAR });
    const stale = screen.getByText('Desktop widget').parentElement!;

    rerender(<Surfaces mobile={HIDDEN} />);
    layout({ mobile: HIDDEN });

    // The old node still answers `getBoundingClientRect` with its last box.
    expect(stale.getBoundingClientRect().left).toBe(SIDEBAR.left);
    expect(stale.isConnected).toBe(false);
    expect(measure()).toBeNull();
  });

  it('falls back rather than flying to a surface scrolled off screen', () => {
    viewport(390, 780);
    render(<Surfaces mobile={TEASER} />);
    layout({ mobile: { ...TEASER, top: 2000, bottom: 2056 } });

    expect(measure()).toBeNull();
  });

  it('falls back when no Explorer surface is mounted at all', () => {
    viewport(1440);
    render(<Surfaces />);
    expect(measure()).toBeNull();
  });

  it('prefers the larger surface if a layout ever shows both', () => {
    // Complementary today (`lg:hidden` vs. a sidebar mounted above `lg`), but
    // the tie-break must be layout, never iteration order.
    viewport(1440);
    render(<Surfaces desktop={SIDEBAR} mobile={TEASER} />);
    layout({ desktop: SIDEBAR, mobile: TEASER });

    expect(measure()?.left).toBe(SIDEBAR.left);
  });
});
