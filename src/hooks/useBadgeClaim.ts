import { useCallback, useRef, useState } from 'react';

import { missionDevFakePublish } from '@/dev/missionHarness';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { usePostOnboardingGuide } from '@/hooks/usePostOnboardingGuide';
import { useToast } from '@/hooks/useToast';
import { buildExplorerClaimTemplate } from '@/lib/badgeClaim';
import {
  POST_ONBOARDING_PATH_IDS,
  type BadgeRewardView,
  type PostOnboardingGuideState,
} from '@/lib/postOnboardingGuide';

/** Completed task ids in canonical order, for the claim's `path` tags. */
function completedPaths(state: PostOnboardingGuideState) {
  return POST_ONBOARDING_PATH_IDS.filter((id) => state.paths[id] === 'completed');
}

/**
 * What actually happened when {@link useBadgeClaim.claim} was called.
 *
 * Returned rather than left to be inferred from the derived `rewardView`,
 * because the caller needs to tell apart outcomes that state alone cannot
 * distinguish — most importantly *"nothing was published because the claim
 * already existed"* (a success: there is nothing left to do) from *"nothing was
 * published because it went wrong"* (retry). Both used to be a silent `return`.
 *
 * A future reward reveal reads this to decide whether to reveal, wait, or offer
 * a retry; nothing consumes it yet, and `MissionReward` ignores it exactly as it
 * did before.
 */
export type BadgeClaimOutcome =
  /** A new claim event was published and recorded. */
  | { status: 'claimed'; claimEventId: string }
  /**
   * The claim already existed — this device, another device, or another tab.
   * Nothing was published, and nothing needed to be: the claim is addressable,
   * so a republish would only replace it with itself.
   */
  | { status: 'already-claimed'; claimEventId?: string }
  /**
   * A claim is genuinely in flight right now (a double-tap here, or another
   * tab's attempt still inside the stale window). Neither claimed nor failed —
   * waiting is the correct response, and a retry would be a second publish.
   */
  | { status: 'in-flight' }
  /**
   * The reward cannot be claimed from this state at all: not signed in, the
   * journey unfinished, or the mission dismissed. A guard, not a user-facing
   * outcome — no surface offers the action from these states.
   */
  | { status: 'ineligible'; rewardView: BadgeRewardView }
  /** The signature or the publish failed. Retryable, and recorded as such. */
  | { status: 'failed'; error: unknown };

/**
 * Publish the public Ditto Explorer badge claim (kind 30637) on explicit user
 * action, and reflect the outcome in the mission's encrypted `badgeClaim`
 * state.
 *
 * ### Idempotency, in three layers
 *
 *  1. **Protocol.** The claim is an *addressable* event keyed by
 *     `(pubkey, 30637, d="ditto-explorer")`, so even a claim published twice —
 *     from two devices, say — replaces itself rather than creating duplicates.
 *     There is no such thing as a double award from a double claim.
 *  2. **Persisted state.** `beginBadgeClaim` refuses the transition (resolving
 *     `false`) when the mission isn't complete, or the badge is already claimed,
 *     or a claim is genuinely in flight — and we don't publish unless it agrees.
 *  3. **Local.** An in-flight ref rejects re-entry from a double-tap before any
 *     await has resolved.
 *
 * A persisted `claiming` older than the recovery timeout means the app died
 * mid-publish; it reads as `failed` (retryable) rather than a spinner that locks
 * the user out forever.
 *
 * Award/accept (NIP-58 kind 8 / 10008) is intentionally NOT handled here — a
 * future issuer server publishes the award after observing this claim, so the
 * UI must say "claimed, award pending" rather than "you have the badge".
 *
 * ### There is no success toast
 *
 * There used to be: *"Badge claimed! You'll be notified when it's awarded."*
 * Both halves were untrue. The claim was *submitted*, not awarded — the award is
 * issued later by a server this client does not control and cannot observe — and
 * nothing in Ditto notifies anyone of anything when it is. The reward surface
 * already says the one true thing ("Badge claim submitted", and where the badge
 * will appear), so the toast was deleted rather than reworded: the success is
 * legible on the surface the user is already looking at.
 *
 * The failure toast stays. Its wording claims nothing that isn't true, and a
 * publish that fails while the user is somewhere else on the page is exactly
 * what a toast is for.
 */
export function useBadgeClaim() {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const {
    state,
    rewardView,
    badgeClaim,
    beginBadgeClaim,
    completeBadgeClaim,
    failBadgeClaim,
    markRewardRevealed,
  } = usePostOnboardingGuide();

  const [isPublishing, setIsPublishing] = useState(false);
  // Guards re-entry within the same tick, before any state has had a chance to
  // reflect the attempt.
  const inFlightRef = useRef(false);
  // The freshest state, for reading *after* an await. The `state` captured in
  // the callback's closure is from the render that created it, so it cannot say
  // why `beginBadgeClaim` refused — the refusal is decided by state written
  // since, possibly by another tab.
  const stateRef = useRef(state);
  stateRef.current = state;

  const claim = useCallback(
    async (options?: { revealedAt?: number }): Promise<BadgeClaimOutcome> => {
      // Localhost harness only: stands in for the signer and the relay so the
      // success path can be exercised without an account. `undefined` in every
      // production build and off localhost, so this collapses to the real guard.
      const fakePublish = missionDevFakePublish();
      if ((!user && !fakePublish) || !state) return { status: 'ineligible', rewardView };
      // A second call before the first has reached any await. Not a failure —
      // the first one is still going to produce the real outcome.
      if (inFlightRef.current) return { status: 'in-flight' };
      // Only an earned, unclaimed (or previously-failed) reward can be claimed.
      if (rewardView !== 'ready' && rewardView !== 'failed') {
        return rewardView === 'claimed' || rewardView === 'revealed'
          ? { status: 'already-claimed', claimEventId: badgeClaim?.claimEventId }
          : rewardView === 'claiming'
            ? { status: 'in-flight' }
            : { status: 'ineligible', rewardView };
      }

      inFlightRef.current = true;
      setIsPublishing(true);
      try {
        // Latch "claiming" in encrypted state first. A `false` result means the
        // transition wasn't allowed — bail without publishing, and say which of
        // the two reasons it was rather than returning silently.
        const began = await beginBadgeClaim();
        if (!began) {
          const current = stateRef.current?.badgeClaim;
          return current?.status === 'claimed'
            ? { status: 'already-claimed', claimEventId: current.claimEventId }
            : { status: 'in-flight' };
        }

        const template = buildExplorerClaimTemplate(completedPaths(state));
        const event = fakePublish
          ? await fakePublish(template)
          : await publishEvent(template);

        // One write, carrying both facts. A reveal in progress must not be able
        // to persist "claimed" and "revealed" as two separate settings writes.
        await completeBadgeClaim(event.id, options);
        return { status: 'claimed', claimEventId: event.id };
      } catch (error) {
        // Record the failure explicitly so the UI can offer a retry instead of
        // pretending the user never tried.
        await failBadgeClaim();
        toast({
          title: 'Couldn’t claim the badge',
          description: 'Please try again.',
          variant: 'destructive',
        });
        return { status: 'failed', error };
      } finally {
        inFlightRef.current = false;
        setIsPublishing(false);
      }
    },
    [
      user,
      state,
      rewardView,
      badgeClaim?.claimEventId,
      beginBadgeClaim,
      publishEvent,
      completeBadgeClaim,
      failBadgeClaim,
      toast,
    ],
  );

  return {
    /**
     * Publish the claim (guarded and idempotent), and report what happened.
     *
     * `revealedAt` is threaded straight through to the persisted claim so a
     * caller that is revealing the reward gets both facts in one write. Callers
     * that are only claiming omit it, exactly as `MissionReward` does.
     */
    claim,
    /**
     * Record the reveal on a claim that already exists, without republishing.
     * Idempotent; a no-op unless the claim is `claimed` and unrevealed.
     */
    markRewardRevealed,
    /**
     * The reward state the UI should render: `locked` | `ready` | `claiming` |
     * `claimed` | `revealed` | `failed` | `dismissed`. Derived, so a stale
     * in-flight claim surfaces as retryable rather than stuck.
     */
    rewardView,
    /** Whether a publish is in flight right now (local or persisted). */
    isClaiming: isPublishing || rewardView === 'claiming',
    /**
     * Whether the claim has already been published successfully.
     *
     * Read from the persisted claim rather than from `rewardView`, because a
     * revealed reward is still a claimed one — the view splits them apart, and
     * this must not start reporting `false` the moment a reveal lands.
     */
    isClaimed: badgeClaim?.status === 'claimed',
    /** Whether the reward reveal has crossed its irreversible point. */
    isRevealed: rewardView === 'revealed',
    /** Whether the last attempt failed and can be retried. */
    isFailed: rewardView === 'failed',
    /** Raw claim record from encrypted settings. */
    badgeClaim,
  };
}
