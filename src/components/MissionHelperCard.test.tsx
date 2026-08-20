import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { MissionHelperCard } from './MissionHelperCard';
import { InteractMissionTip } from './InteractMissionTip';

/**
 * The one card every guided task explains itself through.
 *
 * It is shared on purpose: the first task's guidance and the fourth's are the
 * same component with different copy, so "do they feel like the same feature"
 * is answered by construction rather than by two sets of matching classes.
 * These cover the part that is genuinely shared behaviour — the disclosure.
 */

vi.mock('@/hooks/useBoundedAttention', () => ({
  useBoundedAttention: () => ({ ref: { current: null }, cueing: false, stop: vi.fn() }),
}));
vi.mock('@/hooks/useInteractMissionFlow', () => ({
  useInteractMissionFlow: () => ({ flowActive: true, completed: false, emptyFeed: false }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const card = (props: Partial<Parameters<typeof MissionHelperCard>[0]> = {}) => (
  <MissionHelperCard
    stepLabel="Your mission"
    title="Find your people"
    body="Search for a name or a topic, open someone’s profile, and tap Follow."
    hint="Follow someone new to complete this."
    {...props}
  />
);

const toggle = () => screen.getByRole('button', { name: /find your people/i });

describe('MissionHelperCard — disclosure', () => {
  it('opens expanded, because being told what to do is the point', () => {
    render(card());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/open someone’s profile/i)).toBeVisible();
  });

  it('collapses to a header that still names the running mission', () => {
    render(card());
    fireEvent.click(toggle());

    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    // Compact, but not silent: the step and the task are still on screen, and
    // the control that brings the instruction back is the thing they are on.
    expect(screen.getByText('Your mission')).toBeInTheDocument();
    expect(screen.getByText('Find your people')).toBeInTheDocument();
    expect(screen.getByText(/open someone’s profile/i)).not.toBeVisible();
    expect(screen.getByText(/follow someone new/i)).not.toBeVisible();
  });

  it('reopens on the same control', () => {
    render(card());
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/open someone’s profile/i)).toBeVisible();
  });

  it('is a real disclosure, not a div that listens for clicks', () => {
    render(card());
    const button = toggle();
    // Keyboard reachable, and it says what it controls.
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('aria-controls');
    expect(document.getElementById(button.getAttribute('aria-controls')!)).not.toBeNull();
  });

  it('keeps the title a heading, so the page outline still reads', () => {
    render(card());
    expect(screen.getByRole('heading', { name: /find your people/i })).toBeInTheDocument();
  });

  it('hides the instruction from assistive tech too, not just visually', () => {
    // `hidden` alone loses to a `display` utility; the card must set both, or a
    // "collapsed" card is announced and tabbed into as though it were open.
    render(card({ ctaLabel: 'Search people', onCta: vi.fn() }));
    fireEvent.click(toggle());

    const body = document.getElementById(toggle().getAttribute('aria-controls')!)!;
    expect(body).toHaveAttribute('hidden');
    expect(body.className).toContain('hidden');
    expect(screen.getByRole('button', { name: 'Search people', hidden: true })).not.toBeVisible();
  });

  it('gives the fourth mission the same behaviour, being the same card', () => {
    render(<InteractMissionTip />);
    const button = screen.getByRole('button', { name: /find something you like/i });
    expect(button).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/react, reply, repost, or save it/i)).not.toBeVisible();
  });
});
