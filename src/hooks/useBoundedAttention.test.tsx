import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useBoundedAttention } from './useBoundedAttention';

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

const OPTIONS = {
  enabled: true,
  firstDelayMs: 1_000,
  intervalMs: 5_000,
  durationMs: 500,
  maxCues: 2,
};

/** Render, attach the ref to a node, and mark it on screen. */
function renderAttention(options = OPTIONS) {
  const view = renderHook((props: typeof OPTIONS) => useBoundedAttention(props), {
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

    expect(cues).toBeLessThanOrEqual(OPTIONS.maxCues);
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
