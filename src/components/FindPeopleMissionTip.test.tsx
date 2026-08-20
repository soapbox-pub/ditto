import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { FindPeopleMissionTip } from './FindPeopleMissionTip';

/**
 * The Search-side guidance for the first task.
 *
 * The flow hook is stubbed because what it decides is tested separately (see
 * `useMissionFlowEntry.test.tsx`); what matters here is that the card says the
 * three things a lost user needs — what this is, where it happens, what
 * finishes it — and that it can be put away.
 */

let flow: { flowActive: boolean; completed: boolean } = {
  flowActive: false,
  completed: false,
};

vi.mock('@/hooks/useFindPeopleMissionFlow', () => ({
  useFindPeopleMissionFlow: () => flow,
}));
vi.mock('@/hooks/useBoundedAttention', () => ({
  useBoundedAttention: () => ({ ref: { current: null }, cueing: false, stop: vi.fn() }),
}));

/** The card's disclosure control, in whichever state it is in. */
const toggle = () =>
  screen
    .getAllByRole('button')
    .find((button) => button.hasAttribute('aria-expanded'))!;

describe('search guidance for the find-people task', () => {
  beforeEach(() => {
    flow = { flowActive: false, completed: false };
  });

  it('stays out of the way when the mission is not on this task', () => {
    expect(render(<FindPeopleMissionTip />).container).toBeEmptyDOMElement();
  });

  it('answers what, where and what finishes it', () => {
    flow = { flowActive: true, completed: false };
    render(<FindPeopleMissionTip />);

    // What am I trying to do.
    expect(screen.getByText('Find your people')).toBeInTheDocument();
    // Where, and the concrete moves in the order they happen.
    expect(screen.getByText(/search for a name or a topic/i)).toBeInTheDocument();
    // Which action actually completes it.
    expect(screen.getByText(/follow someone new to complete this/i)).toBeInTheDocument();
  });

  it('points at the Accounts tab only while the user is searching posts', () => {
    const onBrowsePeople = vi.fn();
    flow = { flowActive: true, completed: false };
    const { rerender } = render(
      <FindPeopleMissionTip onPostsTab onBrowsePeople={onBrowsePeople} />,
    );

    const cta = screen.getByRole('button', { name: 'Search people' });
    expect(screen.getByText(/the accounts tab searches profiles/i)).toBeInTheDocument();
    fireEvent.click(cta);
    expect(onBrowsePeople).toHaveBeenCalledTimes(1);

    // Already on Accounts: the nudge would be pointing at the current tab.
    rerender(<FindPeopleMissionTip onPostsTab={false} onBrowsePeople={onBrowsePeople} />);
    expect(screen.queryByRole('button', { name: 'Search people' })).not.toBeInTheDocument();
    expect(screen.getByText(/follow someone new to complete this/i)).toBeInTheDocument();
  });

  it('says what happened instead of what to do once the follow lands', () => {
    flow = { flowActive: true, completed: true };
    render(<FindPeopleMissionTip />);

    expect(screen.getByText('Mission complete')).toBeInTheDocument();
    expect(screen.getByText(/you followed someone/i)).toBeInTheDocument();
    expect(screen.queryByText(/search for a name or a topic/i)).not.toBeInTheDocument();
  });

  it('goes away entirely once the mission moves on', () => {
    flow = { flowActive: true, completed: false };
    const { rerender, container } = render(<FindPeopleMissionTip />);
    expect(screen.getByText('Find your people')).toBeInTheDocument();

    flow = { flowActive: false, completed: false };
    rerender(<FindPeopleMissionTip />);
    expect(container).toBeEmptyDOMElement();
  });

  it('folds away and comes back without losing the mission', () => {
    flow = { flowActive: true, completed: false };
    render(<FindPeopleMissionTip />);

    const button = toggle();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/search for a name or a topic/i)).toBeVisible();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    // Collapsed keeps the header, so the user still knows a mission is running
    // and has somewhere obvious to press.
    expect(screen.getByText('Find your people')).toBeInTheDocument();
    expect(screen.getByText('Your mission')).toBeInTheDocument();
    expect(screen.getByText(/search for a name or a topic/i)).not.toBeVisible();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/search for a name or a topic/i)).toBeVisible();
  });
});
