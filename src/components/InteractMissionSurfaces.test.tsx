import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { InteractMissionTip } from './InteractMissionTip';
import { MissionTaskList } from './MissionTaskList';
import {
  createInitialGuideState,
  type MissionInteraction,
  type PostOnboardingGuideState,
} from '@/lib/postOnboardingGuide';

/**
 * The two surfaces that speak for the interaction task: the feed-side guidance
 * that explains it, and the task row that reports how it was finished.
 */

let flow: {
  flowActive: boolean;
  completed: boolean;
  interaction?: MissionInteraction;
  emptyFeed: boolean;
} = { flowActive: false, completed: false, emptyFeed: false };

vi.mock('@/hooks/useInteractMissionFlow', () => ({
  useInteractMissionFlow: () => flow,
}));
vi.mock('@/hooks/useStartMissionTask', () => ({
  useStartMissionTask: () => vi.fn(),
}));
vi.mock('@/hooks/useBoundedAttention', () => ({
  useBoundedAttention: () => ({ ref: { current: null }, cueing: false, stop: vi.fn() }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

function completedState(interaction?: MissionInteraction): PostOnboardingGuideState {
  const base = createInitialGuideState(1_000);
  return {
    ...base,
    paths: { ...base.paths, interact: 'completed' },
    interact: interaction,
  };
}

describe('feed guidance for the interaction task', () => {
  beforeEach(() => {
    flow = { flowActive: false, completed: false, emptyFeed: false };
  });

  it('stays out of the way when the task is not in progress', () => {
    expect(render(<InteractMissionTip />).container).toBeEmptyDOMElement();
  });

  it('names all four options without demanding any of them', () => {
    flow = { flowActive: true, completed: false, emptyFeed: false };
    render(<InteractMissionTip />);

    expect(screen.getByText('Find something you like')).toBeInTheDocument();
    expect(
      screen.getByText(/react, reply, repost, or save it/i),
    ).toBeInTheDocument();
    // Writing a reply is never required — it is one option among four.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('does not choose a post for the user', () => {
    // No synthetic post, no dev placeholder, no "interact with this one" CTA.
    flow = { flowActive: true, completed: false, emptyFeed: false };
    render(<InteractMissionTip />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers a way forward instead of leaving the user on an empty feed', () => {
    flow = { flowActive: true, completed: false, emptyFeed: true };
    render(<InteractMissionTip />);

    expect(screen.getByText(/your feed is quiet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /find people/i })).toBeInTheDocument();
  });

  it('replaces the guidance with what the user actually did', () => {
    flow = {
      flowActive: true,
      completed: true,
      interaction: { action: 'reply', completedAt: 2_000 },
      emptyFeed: false,
    };
    render(<InteractMissionTip />);

    expect(screen.getByText('You joined the conversation.')).toBeInTheDocument();
    expect(screen.queryByText(/react, reply, repost, or save it/i)).not.toBeInTheDocument();
  });
});

describe('the interaction task row', () => {
  it('offers the four options while unfinished', () => {
    render(<MissionTaskList state={createInitialGuideState(1_000)} interactive />);
    expect(screen.getByText('Find something you like')).toBeInTheDocument();
    expect(
      screen.getByText('React, reply, repost, or save a post from someone else.'),
    ).toBeInTheDocument();
  });

  it('never shows four separate requirements to tick off', () => {
    const state = createInitialGuideState(1_000);
    render(<MissionTaskList state={state} interactive showHints />);
    // One row, one hint, one binary outcome.
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText(/Any one of those on someone else’s post/)).toBeInTheDocument();
  });

  it.each([
    ['reaction', 'You reacted to a post.'],
    ['reply', 'You joined the conversation.'],
    ['repost', 'You shared a post.'],
    ['bookmark', 'You saved something for later.'],
  ] as const)('settles into an action-specific completed state (%s)', (action, message) => {
    render(
      <MissionTaskList
        state={completedState({ action, completedAt: 2_000 })}
        interactive={false}
      />,
    );
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByText('Find something you like')).toBeInTheDocument();
  });

  it('falls back to a plain completed row when the action is unknown', () => {
    // Migrated state from the retired fourth task has no recorded action.
    render(<MissionTaskList state={completedState()} interactive={false} />);
    expect(screen.getByText('Find something you like')).toBeInTheDocument();
    expect(screen.queryByText(/^You /)).not.toBeInTheDocument();
  });

  it('leaves the completed row settled rather than removing it', () => {
    const { container } = render(
      <MissionTaskList
        state={completedState({ action: 'reaction', completedAt: 2_000 })}
        interactive={false}
      />,
    );
    expect(container.querySelectorAll('li')).toHaveLength(4);
  });
});

describe('reduced motion', () => {
  it('disables every mission animation while leaving the completion state visible', () => {
    // The completion feedback must survive without movement: the check, the
    // count, the progress bar and the success copy are all static.
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const reducedBlock = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));

    for (const cls of [
      'mission-attention-glow',
      'mission-attention-nudge',
      'mission-reward-glow',
      'mission-celebrate',
      'mission-count-pop',
      'mission-sparkle',
      'mission-progress-glow',
    ]) {
      expect(css).toContain(`.${cls} {`);
      expect(reducedBlock).toContain(`.${cls}`);
    }
  });

  it('runs every mission animation a finite number of times', () => {
    // No `infinite` anywhere in the mission block: noticeable, never nagging.
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const start = css.indexOf('── Post-onboarding mission surfaces');
    const end = css.indexOf('── Overstimulation block overlay');
    const declarations = css.slice(start, end).match(/animation:[^;]*;/g) ?? [];

    expect(declarations.length).toBeGreaterThan(0);
    for (const declaration of declarations) {
      expect(declaration).not.toMatch(/\binfinite\b/);
    }
  });
});
