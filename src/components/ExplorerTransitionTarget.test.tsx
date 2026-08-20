import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';

import { ExplorerTransitionTarget } from './ExplorerTransitionTarget';
import { ExplorerArrivalContext } from '@/contexts/ExplorerArrivalContext';

function withOwning(owning: boolean, children: ReactNode) {
  return (
    <ExplorerArrivalContext.Provider
      value={{
        owning,
        claim: () => {},
        release: () => {},
        addTarget: () => {},
        removeTarget: () => {},
        measureTarget: () => null,
      }}
    >
      {children}
    </ExplorerArrivalContext.Provider>
  );
}

describe('ExplorerTransitionTarget', () => {
  it('is a plain pass-through when no arrival is running', () => {
    render(withOwning(false, <ExplorerTransitionTarget><p>Mission</p></ExplorerTransitionTarget>));
    const wrapper = screen.getByText('Mission').parentElement!;
    expect(wrapper).not.toHaveClass('invisible');
    expect(wrapper).not.toHaveAttribute('aria-hidden');
  });

  it('stays laid out but unpainted while the arrival owns it', () => {
    // `visibility: hidden`, not `display: none` — it must keep its space so the
    // travelling card has something real to measure, and so nothing shifts when
    // it appears.
    render(withOwning(true, <ExplorerTransitionTarget><p>Mission</p></ExplorerTransitionTarget>));
    const wrapper = screen.getByText('Mission').parentElement!;
    expect(wrapper).toHaveClass('invisible');
    expect(wrapper).not.toHaveClass('hidden');
    expect(screen.getByText('Mission')).toBeInTheDocument();
  });

  it('is inert to assistive tech and the tab order while hidden', () => {
    render(
      withOwning(true, <ExplorerTransitionTarget><button>Start exploring</button></ExplorerTransitionTarget>),
    );
    const wrapper = screen.getByRole('button', { hidden: true }).parentElement!;
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    expect(wrapper).toHaveAttribute('inert');
  });

  it('becomes visible and interactive again once released', () => {
    const { rerender } = render(
      withOwning(true, <ExplorerTransitionTarget><p>Mission</p></ExplorerTransitionTarget>),
    );
    expect(screen.getByText('Mission').parentElement).toHaveClass('invisible');

    rerender(withOwning(false, <ExplorerTransitionTarget><p>Mission</p></ExplorerTransitionTarget>));
    expect(screen.getByText('Mission').parentElement).not.toHaveClass('invisible');
  });

  it('registers its element as a candidate and withdraws it on unmount', () => {
    const targets = new Set<HTMLElement>();
    const value = {
      owning: false,
      claim: () => {},
      release: () => {},
      addTarget: (el: HTMLElement) => void targets.add(el),
      removeTarget: (el: HTMLElement) => void targets.delete(el),
      measureTarget: () => null,
    };
    const { unmount } = render(
      <ExplorerArrivalContext.Provider value={value}>
        <ExplorerTransitionTarget><p>Mission</p></ExplorerTransitionTarget>
      </ExplorerArrivalContext.Provider>,
    );
    expect(targets.size).toBe(1);
    expect([...targets][0]).toBe(screen.getByText('Mission').parentElement);

    // Withdrawing on unmount is what makes a route change mid-flight fall back
    // safely instead of animating toward a detached element.
    unmount();
    expect(targets.size).toBe(0);
  });

  it('withdraws only its own element, never another instance\u2019s', () => {
    // The bug this replaces: one shared slot, cleared by whichever target
    // happened to unmount. On desktop the CSS-hidden mobile teaser unmounting
    // wiped the visible sidebar widget's registration, and the arrival card had
    // nowhere to fly to.
    const targets = new Set<HTMLElement>();
    const value = {
      owning: false,
      claim: () => {},
      release: () => {},
      addTarget: (el: HTMLElement) => void targets.add(el),
      removeTarget: (el: HTMLElement) => void targets.delete(el),
      measureTarget: () => null,
    };
    function Both({ showSecond }: { showSecond: boolean }) {
      return (
        <ExplorerArrivalContext.Provider value={value}>
          <ExplorerTransitionTarget><p>Desktop</p></ExplorerTransitionTarget>
          {showSecond && (
            <ExplorerTransitionTarget><p>Mobile</p></ExplorerTransitionTarget>
          )}
        </ExplorerArrivalContext.Provider>
      );
    }

    const { rerender } = render(<Both showSecond />);
    expect(targets.size).toBe(2);

    rerender(<Both showSecond={false} />);
    expect(targets.size).toBe(1);
    expect([...targets][0]).toBe(screen.getByText('Desktop').parentElement);
  });
});
