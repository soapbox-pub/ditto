import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useSyncExternalStore } from 'react';

import { useRewardCeremony } from './useRewardCeremony';

/**
 * How `leave` moves the history stack — the half a router test cannot see.
 *
 * `RewardCeremony.test.tsx` drives the whole path through a real `MemoryRouter`
 * and asserts where the user ends up. That is the right test for the
 * *destination*, and the wrong one for the *mechanics*, because a memory
 * history is synchronous where a browser history is not:
 *
 *  - `MemoryHistory.go(delta)` moves its index and notifies its listener inline.
 *  - `BrowserHistory.go(n)` is `window.history.go(n)`, which queues a traversal
 *    as a **task** and reports it back through `popstate` afterwards.
 *
 * The first attempt at `leave` popped the ceremony's entry and then pushed the
 * destination from a microtask. Microtasks run before tasks, so in a browser
 * that push landed while the traversal was still pending and the traversal then
 * took the user back off the destination — the exact bug it was written to fix,
 * passing its own test. So these assert the calls, not the outcome: one
 * navigation, no traversal, ever.
 */

/**
 * A router small enough to assert against, real enough to be worth asserting.
 *
 * The location has to actually change when the hook navigates — the ceremony
 * reads its own Back marker back out of `location.state`, and a constant
 * location would make it believe it never pushed anything. Traversal is
 * deliberately *not* implemented: this file exists to prove nothing traverses.
 */
let current = { pathname: '/missions', search: '', hash: '', state: null as unknown, key: 'k0' };
let keys = 0;
const listeners = new Set<() => void>();

const navigate = vi.fn((to: string | number, options?: { state?: unknown; replace?: boolean }) => {
  if (typeof to === 'number') return;
  const [pathname, search] = to.split('?');
  current = {
    pathname,
    search: search ? `?${search}` : '',
    hash: '',
    state: options?.state ?? null,
    key: `k${++keys}`,
  };
  for (const listener of listeners) listener();
});

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useLocation: () =>
    useSyncExternalStore(
      (onChange: () => void) => {
        listeners.add(onChange);
        return () => listeners.delete(onChange);
      },
      () => current,
    ),
}));

/** Drives the hook directly: the ceremony's UI is exercised elsewhere. */
function Harness() {
  const ceremony = useRewardCeremony();
  return (
    <div>
      <button type="button" onClick={() => ceremony.open(null)}>
        open
      </button>
      <button type="button" onClick={() => ceremony.leave('/badges?tab=mine')}>
        leave
      </button>
    </div>
  );
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => {
  navigate.mockClear();
  current = { pathname: '/missions', search: '', hash: '', state: null, key: 'k0' };
});

describe('reward ceremony — leave()', () => {
  it('replaces the ceremony entry instead of stacking on top of it', () => {
    render(<Harness />);
    click('open');
    // Opening pushes one entry at the current URL, carrying the Back marker.
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][1]).toMatchObject({ state: { rewardCeremony: true } });

    navigate.mockClear();
    click('leave');

    // One navigation, replacing the entry the ceremony added. The stack left
    // behind is the one it found, plus the destination.
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/badges?tab=mine', { replace: true });
  });

  it('never traverses history, so no pending pop can undo the arrival', () => {
    // The regression guard. `navigate(-1)` here is a browser traversal whose
    // completion this code cannot observe or order against.
    render(<Harness />);
    click('open');
    navigate.mockClear();
    click('leave');

    expect(navigate).not.toHaveBeenCalledWith(-1);
    for (const [to] of navigate.mock.calls) {
      expect(typeof to).toBe('string');
    }
  });

  it('leaves the arrival alone once the entry is spent', async () => {
    // Nothing may be queued for later: the first fix deferred its push to a
    // microtask, and a microtask is exactly where a late correction would hide.
    render(<Harness />);
    click('open');
    navigate.mockClear();
    click('leave');

    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('pushes when there is no ceremony entry to spend', () => {
    // The revealed panel's own button: no stage was opened, so nothing is being
    // replaced and the journey stays on the stack behind the destination.
    render(<Harness />);
    click('leave');

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/badges?tab=mine', { replace: false });
  });

  it('spends the entry once, so unmount finds nothing left to pop', async () => {
    const { unmount } = render(<Harness />);
    click('open');
    navigate.mockClear();
    click('leave');
    unmount();

    // The cleanup pops only an entry it still owns. `leave` dropped ownership
    // before navigating, which is what stops the arrival being undone a beat
    // after it happened.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalledWith(-1);
  });
});
