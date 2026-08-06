import { useNavigate } from 'react-router-dom';

import { MissionHelperCard } from '@/components/MissionHelperCard';
import { useInteractMissionFlow } from '@/hooks/useInteractMissionFlow';
import { MISSION_TASK_ROUTES } from '@/lib/missionTasks';
import {
  INTERACT_TASK_EMPTY_FEED_GUIDANCE,
  INTERACT_TASK_GUIDANCE,
  interactionSuccessMessage,
  POST_ONBOARDING_PATHS,
} from '@/lib/postOnboardingGuide';

/**
 * The feed-side guidance for the `interact` ("Find something you like") task.
 *
 * It reuses the shared `MissionHelperCard` — the same component, attention
 * budget and reduced-motion behaviour as the guided customize flow — rather
 * than introducing a second style of in-page mission hint.
 *
 * ### What it deliberately does not do
 *
 * It does not highlight every action button on every post, and it does not
 * choose a post for the user. A feed with a ring around four controls on every
 * card is noise, and a mission that points at one specific post has picked the
 * thing the user was supposed to find for themselves. So this states the four
 * options once, near the feed, and then gets out of the way: the task is
 * finished by whatever the user actually engages with, anywhere in Ditto.
 *
 * It also never injects a post. When the feed genuinely has nothing in it, it
 * says so and offers the one thing that fixes it — following someone — instead
 * of leaving the user in front of an empty column holding an impossible task.
 */
export function InteractMissionTip() {
  const navigate = useNavigate();
  const { flowActive, completed, interaction, emptyFeed } = useInteractMissionFlow();

  if (!flowActive) return null;

  const meta = POST_ONBOARDING_PATHS.interact;

  if (completed) {
    return (
      <MissionHelperCard
        className="mx-4 mt-3"
        stepLabel="Mission complete"
        title={meta.label}
        body={interaction ? interactionSuccessMessage(interaction.action) : 'Nicely done.'}
        completed
      />
    );
  }

  return (
    <MissionHelperCard
      className="mx-4 mt-3"
      stepLabel="Your mission"
      title={meta.label}
      body={emptyFeed ? INTERACT_TASK_EMPTY_FEED_GUIDANCE : INTERACT_TASK_GUIDANCE}
      hint={emptyFeed ? undefined : meta.completionHint}
      ctaLabel={emptyFeed ? 'Find people' : undefined}
      onCta={emptyFeed ? () => navigate(MISSION_TASK_ROUTES['find-people']) : undefined}
    />
  );
}
