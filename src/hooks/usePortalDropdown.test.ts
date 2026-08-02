import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { RefObject } from 'react';

import { usePortalDropdown } from './usePortalDropdown';

// Geometry used by every test. The textarea's viewport rect starts at
// (50, 100) and is 280px wide; the caret sits 150px below the textarea top,
// so the caret line's viewport-top Y is 250. scrollTop is 0 in jsdom.
const TEXTAREA_RECT = {
  top: 100,
  left: 50,
  right: 330,
  bottom: 124,
  width: 280,
  height: 24,
  x: 50,
  y: 100,
  toJSON: () => ({}),
} as DOMRect;

const CARET = { top: 150, left: 20 };
const LINE_HEIGHT = 24;
const GAP = 4;
const CARET_LINE_TOP = TEXTAREA_RECT.top + CARET.top; // 250
const BELOW_TOP = CARET_LINE_TOP + LINE_HEIGHT + GAP; // 278

/** A textarea whose geometry matches the fixture above. */
function makeTextarea(): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(TEXTAREA_RECT);
  Object.defineProperty(textarea, 'clientWidth', { configurable: true, value: 280 });
  return textarea;
}

/** Render the hook against a fixed textarea ref with a controllable height estimate. */
function renderDropdown(textareaRef: RefObject<HTMLTextAreaElement | null>) {
  return renderHook(
    (opts: { dropdownHeight: number }) =>
      usePortalDropdown({
        textareaRef,
        isOpen: true,
        onClose: vi.fn(),
        dropdownHeight: opts.dropdownHeight,
      }),
    { initialProps: { dropdownHeight: 240 } },
  );
}

describe('usePortalDropdown computePosition', () => {
  beforeEach(() => {
    // jsdom defaults; individual tests override as needed.
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 768 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      lineHeight: `${LINE_HEIGHT}px`,
    } as CSSStyleDeclaration);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // jsdom has no Visual Viewport API; individual tests fake one, so reset
    // it here to keep the fallback path active for the other tests.
    Object.defineProperty(window, 'visualViewport', { configurable: true, writable: true, value: undefined });
  });

  it('keeps the below-caret top anchoring when there is room in the viewport', () => {
    const { result } = renderDropdown({ current: makeTextarea() });

    // 278 + 240 = 518 < 768, so the dropdown stays below the caret.
    const pos = result.current.computePosition(CARET);

    expect('top' in pos).toBe(true);
    if ('top' in pos) {
      expect(pos.top).toBe(BELOW_TOP);
      expect(pos.left).toBe(50); // rect.left (caret.left clamps to 0 of clientWidth - 280)
    }
  });

  it('anchors the flipped dropdown by its bottom edge at the caret line', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 300 });
    const { result } = renderDropdown({ current: makeTextarea() });

    // 278 + 240 = 518 > 300, so the dropdown flips above the caret.
    const pos = result.current.computePosition(CARET);

    expect('bottom' in pos).toBe(true);
    if ('bottom' in pos) {
      // The bottom edge must touch the caret line (250) minus the 4px gap,
      // expressed as a CSS `bottom` distance from the viewport bottom.
      expect(window.innerHeight - pos.bottom).toBe(CARET_LINE_TOP - GAP);
      expect(pos.left).toBe(50);
    }
  });

  it('keeps the bottom edge on the caret line regardless of dropdownHeight', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 300 });
    const { result, rerender } = renderDropdown({ current: makeTextarea() });

    // Geometry: the caret line sits at viewport Y 250, which is 50px above
    // the 300px viewport bottom. The flipped box's bottom edge hangs GAP
    // above the caret line, so its CSS `bottom` distance is 50 + 4 = 54.
    const caretLineFromBottom = window.innerHeight - CARET_LINE_TOP;
    const expectedBottom = caretLineFromBottom + GAP;

    // A short result list renders well under the 240px estimate — the anchor
    // must not depend on the assumed max height.
    rerender({ dropdownHeight: 120 });

    const pos = result.current.computePosition(CARET);
    expect('bottom' in pos).toBe(true);
    if ('bottom' in pos) {
      expect(pos.bottom).toBe(expectedBottom);
      expect(pos.left).toBe(50);
      // Same viewport Y for the 240px estimate as for the 120px estimate.
      rerender({ dropdownHeight: 240 });
      const posFull = result.current.computePosition(CARET);
      expect('bottom' in posFull).toBe(true);
      if ('bottom' in posFull) {
        expect(posFull.bottom).toBe(expectedBottom);
      }
    }
  });

  it('prefers visualViewport.height over window.innerHeight for flip math', () => {
    // Simulate the iOS keyboard: the visual viewport shrinks to 400 while
    // window.innerHeight still reports 768.
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      writable: true,
      value: { height: 400 },
    });
    const { result } = renderDropdown({ current: makeTextarea() });

    // With innerHeight alone (768) the dropdown fits below (278 + 240 < 768).
    // The shrunk visual viewport sees it overflow, so the hook must flip.
    const pos = result.current.computePosition(CARET);

    expect('bottom' in pos).toBe(true);
    if ('bottom' in pos) {
      // The bottom edge sits 4px above the caret line, i.e. 154px above the
      // visual viewport's bottom edge — not the window's 768px bottom.
      expect(pos.bottom).toBe(400 - (CARET_LINE_TOP - GAP));
      expect(pos.left).toBe(50);
    }
  });

  it('flips a short list above when the estimate fits neither direction but the caret has room above', () => {
    // The maintainer repro: a 300px viewport, the caret line at viewport Y
    // 200, and a result list that renders far shorter than the 240px
    // estimate. The estimate overflows below (228 + 240 > 300) and does not
    // fit above (200 - 240 - 4 < 0), but there is more room above the caret
    // (196px) than below it (72px). The box must flip and anchor by its
    // bottom edge so the short list grows up into the available space
    // instead of clipping at the viewport bottom.
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 300 });
    const { result } = renderDropdown({ current: makeTextarea() });

    // Caret coords with the line at viewport Y 200 (rect top 100 + caret 100).
    const pos = result.current.computePosition({ top: 100, left: 20 });

    expect('bottom' in pos).toBe(true);
    if ('bottom' in pos) {
      expect(pos.bottom).toBe(300 - (200 - GAP));
      expect(pos.left).toBe(50);
    }
  });
});
