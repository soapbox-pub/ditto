import { useMissionCelebration } from '@/hooks/useMissionCelebration';
import { usePostOnboardingGuide } from '@/hooks/usePostOnboardingGuide';
import {
  interactionSuccessMessage,
  isCeremonyOwed,
  rewardPresentation,
} from '@/lib/postOnboardingGuide';

/**
 * The facts every mission surface derives from the mission, in one place.
 *
 * The sidebar widget, the mobile teaser and `/missions` each read the same
 * state and each worked out the same three things from it — whether the reward
 * is earned but unclaimed, whether progress should still be on screen, and
 * whether to say back what the user just did. Those derivations were copied
 * between the surfaces during visual iteration, comments and all, which is
 * precisely how they start to disagree.
 *
 * This owns **no policy**. Completion is decided by `MissionEngine` and written
 * by `usePostOnboardingGuide`; this only reads them and answers presentation
 * questions. Everything the underlying hooks expose is passed through, so a
 * surface needs one call rather than three.
 */
export function useMissionSurfaceState() {
  const guide = usePostOnboardingGuide();
  const { celebrating, completedPath } = useMissionCelebration();

  /**
   * Earned, and the reveal still owed — the state that reframes a surface as a
   * reward.
   *
   * This used to be "earned and not claimed", which made every compact surface
   * vanish the moment the claim went out. That was right while claiming *was*
   * the end of the journey; it stopped being right the moment the reveal became
   * a separate fact, because a user who claimed before the reveal existed would
   * have lost every route back to it. See `isCeremonyOwed`.
   */
  const ceremonyOwed = isCeremonyOwed(guide.state);

  /**
   * How the reward should present itself right now — `settling` while the
   * completion celebration is still playing, otherwise the claim state itself.
   */
  const presentation = rewardPresentation(guide.rewardView, celebrating);

  /**
   * Whether the reward is ready to be acted on. False through the settle, so
   * the reward's own moment cannot start on top of the completion's.
   */
  const ceremonyOpenable = ceremonyOwed && presentation !== 'settling';

  /**
   * Hold the progress presentation through the celebration, even when this
   * completion also unlocked the reward.
   *
   * The fourth task is always the last one, so without this a surface swapped
   * straight to "Reward unlocked" the instant it landed — throwing away the
   * count pop, the sparkles and the bar reaching 4/4 at the one moment they
   * mean the most. The order the user should read is: *you did this* → *that's
   * 4 of 4* → *here's your reward*, and the reward is still one settle away.
   */
  const showProgress = !ceremonyOwed || celebrating;

  /**
   * What the user actually did, for the celebration window only.
   *
   * Named by `completedPath`, so a *different* task completing later can never
   * replay this acknowledgement, and it lasts exactly as long as the
   * celebration — then the surface settles back into its ordinary next-step
   * state.
   */
  const interactionSuccess =
    celebrating && completedPath === 'interact' && guide.interaction
      ? interactionSuccessMessage(guide.interaction.action)
      : undefined;

  return {
    ...guide,
    celebrating,
    completedPath,
    ceremonyOwed,
    ceremonyOpenable,
    presentation,
    showProgress,
    interactionSuccess,
    /** Whether the claim has been published, revealed or not. */
    claimSubmitted: guide.badgeClaim?.status === 'claimed',
  };
}
