import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useVisualViewportVar } from './useVisualViewportVar';

/**
 * A minimal stand-in for `window.visualViewport` (jsdom doesn't implement it).
 * Real EventTarget so the hook's addEventListener/removeEventListener work, with
 * mutable `height`/`offsetTop` we can mutate before dispatching an event.
 */
class MockVisualViewport extends EventTarget {
  height = 800;
  offsetTop = 0;
}

describe('useVisualViewportVar', () => {
  const root = document.documentElement;
  let vv: MockVisualViewport;
  let originalVV: typeof window.visualViewport;

  beforeEach(() => {
    vv = new MockVisualViewport();
    originalVV = window.visualViewport;
    Object.defineProperty(window, 'visualViewport', {
      value: vv,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', {
      value: originalVV,
      writable: true,
      configurable: true,
    });
    root.style.removeProperty('--visual-viewport-height');
    root.style.removeProperty('--visual-viewport-offset-top');
  });

  it('publishes the initial viewport height and offset on mount', () => {
    renderHook(() => useVisualViewportVar());

    expect(root.style.getPropertyValue('--visual-viewport-height')).toBe('800px');
    // No keyboard yet → the fixed compose sheet sits flush at the top.
    expect(root.style.getPropertyValue('--visual-viewport-offset-top')).toBe('0px');
  });

  it('tracks the height shrinking on resize when the keyboard opens', () => {
    renderHook(() => useVisualViewportVar());

    vv.height = 500;
    vv.dispatchEvent(new Event('resize'));

    expect(root.style.getPropertyValue('--visual-viewport-height')).toBe('500px');
  });

  // The core replication of both reported bugs. When the virtual keyboard raises
  // and the browser scrolls the layout viewport to reveal the focused input (the
  // GIF search field), `visualViewport.offsetTop` becomes non-zero and the change
  // is reported via a `scroll` event — NOT `resize`. A fixed, `top: 0` compose
  // sheet must consume this offset to stay aligned with the visible viewport;
  // otherwise iOS shows a gap above the keyboard with a truncated picker, and
  // Android opens a blank void that shoves the composer off-screen.
  it('exposes the visual-viewport offset from a scroll event (keyboard raise)', () => {
    renderHook(() => useVisualViewportVar());

    // Keyboard opens: viewport shrinks AND scrolls down within the layout viewport.
    vv.height = 500;
    vv.offsetTop = 150;
    vv.dispatchEvent(new Event('scroll'));

    expect(root.style.getPropertyValue('--visual-viewport-offset-top')).toBe('150px');
    expect(root.style.getPropertyValue('--visual-viewport-height')).toBe('500px');
  });

  it('clears both variables on unmount', () => {
    const { unmount } = renderHook(() => useVisualViewportVar());
    unmount();

    expect(root.style.getPropertyValue('--visual-viewport-height')).toBe('');
    expect(root.style.getPropertyValue('--visual-viewport-offset-top')).toBe('');
  });
});
