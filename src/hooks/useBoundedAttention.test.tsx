import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useBoundedAttention, type BoundedAttentionOptions } from './useBoundedAttention';

/**
 * Captured IntersectionObserver callbacks, so a test can decide when the
 * animated element is actually on screen. The global mock in `test/setup.ts`
 * never fires, which would otherwise leave every surface permanently offscreen.
 */
let observerCallbacks: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];

function mockIntersectionObserver() {
  observerCallbacks = [];
  class FakeIntersectionObserver {
    constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
      observerCallbacks.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.IntersectionObserver =
    FakeIntersectionObserver as unknown as typeof IntersectionObserver;
}

/** Report the observed element as on/off screen. */
function setOnScreen(isIntersecting: boolean) {
  act(() => {
    for (const callback of observerCallbacks) callback([{ isIntersecting }]);
  });
}

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const OPTIONS: BoundedAttentionOptions = {
  enabled: true,
  firstDelayMs: 1_000,
  intervalMs: 5_000,
  durationMs: 500,
  maxCues: 2,
};

/** Render, attach the ref to a node, and mark it on screen. */
function renderAttention(options: BoundedAttentionOptions = OPTIONS) {
  const view = renderHook((props: BoundedAttentionOptions) => useBoundedAttention(props), {
    initialProps: options,
  });
  act(() => view.result.current.ref(document.createElement('div')));
  setOnScreen(true);
  return view;
}

describe('useBoundedAttention', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockIntersectionObserver();
    setReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is quiet until the first delay elapses', () => {
    const { result } = renderAttention();
    expect(result.current.cueing).toBe(false);

    act(() => void vi.advanceTimersByTime(999));
    expect(result.current.cueing).toBe(false);
  });

  it('fires a bounded cue that ends on its own', () => {
    const { result } = renderAttention();

    act(() => void vi.advanceTimersByTime(1_000));
    expect(result.current.cueing).toBe(true);

    act(() => void vi.advanceTimersByTime(500));
    expect(result.current.cueing).toBe(false);
  });

  it('never exceeds maxCues, however long the page stays open', () => {
    const { result } = renderAttention();
    let cues = 0;

    // Ten intervals' worth of time — far more than the cap allows.
    for (let i = 0; i < 40; i++) {
      act(() => void vi.advanceTimersByTime(1_000));
      if (result.current.cueing) {
        cues += 1;
        act(() => void vi.advanceTimersByTime(500));
      }
    }

    expect(cues).toBeLessThanOrEqual(OPTIONS.maxCues ?? 0);
    expect(cues).toBeGreaterThan(0);
    // And it is silent for good afterwards.
    act(() => void vi.advanceTimersByTime(120_000));
    expect(result.current.cueing).toBe(false);
  });

  it('never cues under prefers-reduced-motion', () => {
    setReducedMotion(true);
    const { result } = renderAttention();

    act(() => void vi.advanceTimersByTime(60_000));
    expect(result.current.cueing).toBe(false);
  });

  it('never cues while the surface is off screen', () => {
    const view = renderHook(() => useBoundedAttention(OPTIONS));
    act(() => view.result.current.ref(document.createElement('div')));
    setOnScreen(false);

    act(() => void vi.advanceTimersByTime(60_000));
    expect(view.result.current.cueing).toBe(false);
  });

  it('starts cueing once the surface scrolls into view', () => {
    const view = renderHook(() => useBoundedAttention(OPTIONS));
    act(() => view.result.current.ref(document.createElement('div')));
    setOnScreen(false);

    act(() => void vi.advanceTimersByTime(10_000));
    expect(view.result.current.cueing).toBe(false);

    setOnScreen(true);
    act(() => void vi.advanceTimersByTime(1_000));
    expect(view.result.current.cueing).toBe(true);
  });

  it('does not spend a cue while the tab is hidden', () => {
    const { result } = renderAttention();
    const spy = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden' as DocumentVisibilityState);

    act(() => void vi.advanceTimersByTime(1_000));
    expect(result.current.cueing).toBe(false);

    // Coming back to the tab, the cue is still available — it was deferred,
    // not consumed.
    spy.mockReturnValue('visible' as DocumentVisibilityState);
    act(() => void vi.advanceTimersByTime(5_000));
    expect(result.current.cueing).toBe(true);
    spy.mockRestore();
  });

  it('goes silent permanently once the user interacts', () => {
    const { result } = renderAttention();

    act(() => result.current.stop());
    act(() => void vi.advanceTimersByTime(60_000));
    expect(result.current.cueing).toBe(false);
  });

  it('goes silent when attention is no longer wanted', () => {
    const view = renderAttention();

    view.rerender({ ...OPTIONS, enabled: false });
    act(() => void vi.advanceTimersByTime(60_000));
    expect(view.result.current.cueing).toBe(false);
  });

  it('does not restart its schedule on an unrelated re-render', () => {
    const view = renderAttention();

    // Re-render repeatedly during the first delay; the cue must still arrive on
    // the original schedule rather than being pushed back each time.
    for (let i = 0; i < 5; i++) {
      act(() => void vi.advanceTimersByTime(100));
      view.rerender(OPTIONS);
    }
    act(() => void vi.advanceTimersByTime(500));

    expect(view.result.current.cueing).toBe(true);
  });
});

describe('useBoundedAttention — persisted budget', () => {
  const BUDGET = 'ditto:mission-attention:abc';

  beforeEach(() => {
    vi.useFakeTimers();
    mockIntersectionObserver();
    setReducedMotion(false);
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  /** Mount, go on screen, and burn one cue. */
  function spendOneCue() {
    const view = renderAttention({ ...OPTIONS, budgetKey: BUDGET });
    act(() => void vi.advanceTimersByTime(1_000));
    const cued = view.result.current.cueing;
    act(() => void vi.advanceTimersByTime(500));
    view.unmount();
    return cued;
  }

  it('does not re-arm on remount once the budget is spent', () => {
    // A sidebar surface remounts on every navigation. Without a persisted
    // budget, "at most two cues" silently becomes "two cues on every page".
    expect(spendOneCue()).toBe(true);
    expect(spendOneCue()).toBe(true);

    // Budget exhausted — every later mount is silent.
    for (let i = 0; i < 5; i++) {
      const view = renderAttention({ ...OPTIONS, budgetKey: BUDGET });
      act(() => void vi.advanceTimersByTime(60_000));
      expect(view.result.current.cueing).toBe(false);
      view.unmount();
    }
  });

  it('records each spent cue', () => {
    spendOneCue();
    expect(localStorage.getItem(BUDGET)).toBe('1');
    spendOneCue();
    expect(localStorage.getItem(BUDGET)).toBe('2');
  });

  it('keeps separate budgets for separate keys', () => {
    spendOneCue();
    spendOneCue();

    const other = renderAttention({ ...OPTIONS, budgetKey: 'ditto:mission-attention:xyz' });
    act(() => void vi.advanceTimersByTime(1_000));
    expect(other.result.current.cueing).toBe(true);
  });

  it('re-seeds the budget when the account changes under a mounted surface', () => {
    // The sidebar widget and the mobile teaser stay mounted across an account
    // switch; only their `budgetKey` changes. Seeding the spend count once, at
    // first render, meant the incoming account inherited the outgoing one's —
    // and at the cap, inherited a silence it never earned.
    const OTHER = 'ditto:mission-attention:other';
    expect(spendOneCue()).toBe(true);
    expect(spendOneCue()).toBe(true);

    const view = renderAttention({ ...OPTIONS, budgetKey: BUDGET });
    act(() => void vi.advanceTimersByTime(60_000));
    expect(view.result.current.cueing).toBe(false);

    // A different account: its own budget, untouched.
    act(() => view.rerender({ ...OPTIONS, budgetKey: OTHER }));
    act(() => void vi.advanceTimersByTime(1_000));
    expect(view.result.current.cueing).toBe(true);
    act(() => void vi.advanceTimersByTime(500));
    expect(localStorage.getItem(OTHER)).toBe('1');

    // …and switching back restores the first account's own spend, rather than
    // whatever the second one happened to leave behind.
    act(() => view.rerender({ ...OPTIONS, budgetKey: BUDGET }));
    act(() => void vi.advanceTimersByTime(60_000));
    expect(view.result.current.cueing).toBe(false);
    expect(localStorage.getItem(BUDGET)).toBe('2');
  });

  it('treats a corrupt budget as unspent rather than throwing', () => {
    localStorage.setItem(BUDGET, 'not-a-number');
    const view = renderAttention({ ...OPTIONS, budgetKey: BUDGET });
    act(() => void vi.advanceTimersByTime(1_000));
    expect(view.result.current.cueing).toBe(true);
  });

  it('still re-arms per mount when no budget key is given', () => {
    // Unchanged behaviour for callers that genuinely want a per-mount cue.
    const first = renderAttention();
    act(() => void vi.advanceTimersByTime(1_000));
    expect(first.result.current.cueing).toBe(true);
    first.unmount();

    const second = renderAttention();
    act(() => void vi.advanceTimersByTime(1_000));
    expect(second.result.current.cueing).toBe(true);
  });
});
