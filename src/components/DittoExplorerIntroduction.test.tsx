import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';

import { DittoExplorerIntroduction } from './DittoExplorerIntroduction';
import { resetAutoWrites } from '@/lib/missionAutoWrites';

/**
 * The introduction records that it was shown, from an effect. That effect is
 * where a live incident started: it was keyed on the setter, the setter's
 * identity changed on every render, and a failing write re-rendered by itself.
 *
 * These tests hold the *view* to its side of the contract — it may ask once per
 * mount and must not turn rendering into writing — while
 * `usePostOnboardingGuide` holds the session-level line underneath it.
 */
const markIntroPresented = vi.fn(() => Promise.resolve());
const acknowledgeIntro = vi.fn(() => Promise.resolve());
const postponeIntro = vi.fn(() => Promise.resolve());

vi.mock('@/hooks/usePostOnboardingGuide', () => ({
  usePostOnboardingGuide: () => ({
    // Deliberately fresh objects each render, the way react-query behaves.
    // Only the setters are stable, which is the property under test.
    markIntroPresented,
    acknowledgeIntro,
    postponeIntro,
  }),
}));

function renderIntro() {
  return render(
    <IntlProvider locale="en">
      <DittoExplorerIntroduction />
    </IntlProvider>,
  );
}

describe('DittoExplorerIntroduction — rendering is not writing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAutoWrites();
  });

  it('records the presentation once, not once per render', () => {
    const { rerender } = renderIntro();
    expect(markIntroPresented).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 50; i++) {
      rerender(
        <IntlProvider locale="en">
          <DittoExplorerIntroduction />
        </IntlProvider>,
      );
    }
    expect(markIntroPresented).toHaveBeenCalledTimes(1);
  });

  it('does not grow the count when two surfaces are mounted at once', () => {
    // The sidebar widget and /missions can both be up. Each may ask; the hook
    // is what makes the pair produce a single write.
    render(
      <IntlProvider locale="en">
        <DittoExplorerIntroduction variant="sidebar" />
        <DittoExplorerIntroduction variant="page" />
      </IntlProvider>,
    );
    expect(markIntroPresented).toHaveBeenCalledTimes(2);
    expect(markIntroPresented.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('stops asking as soon as it unmounts', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderIntro();
      expect(markIntroPresented).toHaveBeenCalledTimes(1);
      unmount();
      vi.clearAllMocks();

      // Nothing scheduled may outlive the component: no timer, no retry, no
      // effect left running after the surface is gone.
      act(() => void vi.advanceTimersByTime(60_000));
      expect(markIntroPresented).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('remounting many times stays bounded per mount', () => {
    for (let i = 0; i < 10; i++) {
      const { unmount } = renderIntro();
      unmount();
    }
    // One per mount and no more — the unbounded case was thousands per second
    // from a single mount.
    expect(markIntroPresented).toHaveBeenCalledTimes(10);
  });

  it('offers the two real choices as explicit user actions', () => {
    renderIntro();
    expect(screen.getByRole('button', { name: 'Start exploring' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maybe later' })).toBeInTheDocument();
    expect(acknowledgeIntro).not.toHaveBeenCalled();
    expect(postponeIntro).not.toHaveBeenCalled();
  });
});
