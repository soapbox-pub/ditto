import { useCallback, useRef, useState } from 'react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { usePostOnboardingGuide } from '@/hooks/usePostOnboardingGuide';
import { useToast } from '@/hooks/useToast';
import { buildExplorerClaimTemplate } from '@/lib/badgeClaim';
import {
  POST_ONBOARDING_PATH_IDS,
  type PostOnboardingGuideState,
} from '@/lib/postOnboardingGuide';

/** Completed task ids in canonical order, for the claim's `path` tags. */
function completedPaths(state: PostOnboardingGuideState) {
  return POST_ONBOARDING_PATH_IDS.filter((id) => state.paths[id] === 'completed');
}

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
  } = usePostOnboardingGuide();

  const [isPublishing, setIsPublishing] = useState(false);
  // Guards re-entry within the same tick, before any state has had a chance to
  // reflect the attempt.
  const inFlightRef = useRef(false);

  const claim = useCallback(async () => {
    if (!user || !state) return;
    if (inFlightRef.current) return;
    // Only an earned, unclaimed (or previously-failed) reward can be claimed.
    if (rewardView !== 'ready' && rewardView !== 'failed') return;

    inFlightRef.current = true;
    setIsPublishing(true);
    try {
      // Latch "claiming" in encrypted state first. A `false` result means the
      // transition wasn't allowed (claimed elsewhere, already in flight) — bail
      // without publishing.
      const began = await beginBadgeClaim();
      if (!began) return;

      const template = buildExplorerClaimTemplate(completedPaths(state));
      const event = await publishEvent(template);

      await completeBadgeClaim(event.id);
      toast({
        title: 'Badge claimed!',
        description: 'You’ll be notified when it’s awarded.',
      });
    } catch {
      // Record the failure explicitly so the UI can offer a retry instead of
      // pretending the user never tried.
      await failBadgeClaim();
      toast({
        title: 'Couldn’t claim the badge',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      inFlightRef.current = false;
      setIsPublishing(false);
    }
  }, [
    user,
    state,
    rewardView,
    beginBadgeClaim,
    publishEvent,
    completeBadgeClaim,
    failBadgeClaim,
    toast,
  ]);

  return {
    /** Publish the claim (guarded and idempotent). */
    claim,
    /**
     * The reward state the UI should render: `locked` | `ready` | `claiming` |
     * `claimed` | `failed` | `dismissed`. Derived, so a stale in-flight claim
     * surfaces as retryable rather than stuck.
     */
    rewardView,
    /** Whether a publish is in flight right now (local or persisted). */
    isClaiming: isPublishing || rewardView === 'claiming',
    /** Whether the claim has already been published successfully. */
    isClaimed: rewardView === 'claimed',
    /** Whether the last attempt failed and can be retried. */
    isFailed: rewardView === 'failed',
    /** Raw claim record from encrypted settings. */
    badgeClaim,
  };
}
