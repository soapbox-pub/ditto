import { useNavigate } from 'react-router-dom';
import { Award, Check, Loader2, Lock, RotateCcw } from 'lucide-react';

import { RevealedRewardArt, SealedRewardArt } from '@/components/MissionArt';
import { Button } from '@/components/ui/button';
import { useBadgeClaim } from '@/hooks/useBadgeClaim';
import { rewardPresentation } from '@/lib/postOnboardingGuide';
import { cn } from '@/lib/utils';

/**
 * The reward region of a journey: one panel that never blurs two states
 * together, and never shows what is inside before it has been revealed.
 *
 * | State       | What the user sees                                          |
 * |-------------|-------------------------------------------------------------|
 * | `locked`    | sealed token, how far off it is, no action                  |
 * | `settling`  | sealed token, "Journey complete", no action yet             |
 * | `ready`     | "Journey complete", the seal opened, "Claim reward"         |
 * | `claiming`  | spinner, action disabled                                    |
 * | `claimed`   | "Badge claim submitted", a link to Badges                   |
 * | `revealed`  | as `claimed` — the reveal experience does not exist yet     |
 * | `failed`    | "That didn't go through", "Try again"                       |
 * | `dismissed` | a quiet note that the journey is hidden                     |
 *
 * ### Why `settling` exists
 *
 * The fourth task is always the last one, so finishing it lands 4/4 and an
 * earned reward in the same write. This panel used to read `ready` from that
 * very render — its copy, its call to action and its glow all arriving on top of
 * the completion celebration that was still playing beside it, so the reward
 * competed with the moment that produced it. `settling` is the beat in between:
 * the panel acknowledges the completion and stays sealed, then resolves once the
 * celebration is over. It is a presentation state only — nothing is delayed,
 * nothing is persisted, and no timer is started here. See `rewardPresentation`.
 *
 * A user who finished the journey somewhere else and opens `/missions` later is
 * not celebrating, so they get `ready` immediately. The settle is never replayed.
 *
 * ### Two things this deliberately does not say
 *
 * It does not show the reward. The badge artwork is a picture of what the user
 * has not earned yet, so every state here uses the abstract seal from
 * `MissionArt`. Opening it belongs to the reveal experience, which does not
 * exist yet, so even `ready` shows a sealed-but-openable token rather than
 * pretending the reveal already happened.
 *
 * It does not promise a notification. Claiming publishes a public request
 * (kind 30637); the NIP-58 award is issued later by a server Ditto does not
 * control, and which is currently inactive. "You'll be notified" was a promise
 * this client cannot keep, so the copy says where the badge will appear instead
 * of undertaking to tell anyone about it.
 *
 * The locked state never depends on colour or desaturation alone: there is a
 * padlock in the art, a padlock beside the word "Locked", and the count of what
 * is left to do.
 */
/** The reward art's edge length on this panel, in px (was `size-28`). */
const REWARD_ART_SIZE = 112;

export function MissionReward({
  completedCount,
  totalCount,
  celebrating = false,
}: {
  completedCount: number;
  totalCount: number;
  /**
   * Whether the completion celebration is playing right now.
   *
   * A prop rather than another `useMissionCelebration` call, because that hook
   * baselines the count it first observes: a second instance mounting here would
   * hold its own timer, started from its own first render, and the panel could
   * settle before or after the journey above it. The page reads the flag once
   * and both halves of the moment run off it.
   */
  celebrating?: boolean;
}) {
  const navigate = useNavigate();
  const { claim, rewardView, isClaiming } = useBadgeClaim();

  const view = rewardPresentation(rewardView, celebrating);
  const remaining = Math.max(0, totalCount - completedCount);
  const sealed = view === 'locked' || view === 'settling' || view === 'dismissed';
  // Claimed and revealed read the same here: the reveal experience does not
  // exist yet, so both say the one true thing about the claim.
  const claimSubmitted = view === 'claimed' || view === 'revealed';

  return (
    <div
      className={cn(
        'flex h-full flex-col items-center gap-4 rounded-2xl border p-6 text-center',
        sealed ? 'border-border/70 bg-muted/20' : 'border-primary/30 bg-primary/[0.04]',
        // Finite (three runs) and already disabled under prefers-reduced-motion.
        // Gated on the *presentation*, so it cannot start under the celebration.
        view === 'ready' && 'mission-reward-glow',
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Special reward
      </p>

      {/* Every state before the reveal shows the same sealed object, warmed once
          the journey is finished. A submitted claim is *not* a reveal, so
          `claimed` is still sealed — publishing the claim must not be what
          finally shows the user their reward. */}
      {view === 'revealed' ? (
        <RevealedRewardArt size={REWARD_ART_SIZE} />
      ) : (
        <SealedRewardArt size={REWARD_ART_SIZE} ready={!sealed} />
      )}

      {view === 'settling' && (
        /* Earned, acknowledged, still sealed. One true line and no action: every
           other word on screen right now belongs to the celebration. */
        <p className="text-base font-semibold text-foreground">Journey complete</p>
      )}

      {view === 'locked' && (
        <div className="space-y-1.5">
          <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-foreground">
            <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            Locked
          </p>
          <p className="text-sm text-muted-foreground">Complete your journey to reveal it.</p>
          <p className="text-xs text-muted-foreground">
            {completedCount} of {totalCount} missions complete
            {remaining > 0 ? `, ${remaining} to go` : ''}
          </p>
        </div>
      )}

      {view === 'dismissed' && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-foreground">This journey is hidden</p>
          <p className="text-sm text-muted-foreground">
            Your progress is kept. Pick it back up whenever you like.
          </p>
        </div>
      )}

      {(view === 'ready' || view === 'claiming' || view === 'failed') && (
        <>
          <div className="space-y-1.5">
            <p className="text-base font-semibold text-foreground">Journey complete</p>
            <p className="text-sm text-muted-foreground">
              {view === 'failed'
                ? 'That claim didn’t go through. Nothing was lost, so you can try again.'
                : 'Your special reward is ready.'}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="w-full max-w-56 gap-1.5 rounded-full font-semibold"
            disabled={isClaiming}
            onClick={() => void claim()}
          >
            {isClaiming ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Claiming…
              </>
            ) : view === 'failed' ? (
              <>
                <RotateCcw className="size-4" aria-hidden />
                Try again
              </>
            ) : (
              <>
                <Award className="size-4" aria-hidden />
                Claim reward
              </>
            )}
          </Button>
        </>
      )}

      {claimSubmitted && (
        <>
          <div className="space-y-1.5">
            <p className="flex items-center justify-center gap-1.5 text-base font-semibold text-foreground">
              <Check className="size-4 shrink-0 text-primary" aria-hidden />
              Badge claim submitted
            </p>
            <p className="text-sm text-muted-foreground">
              Your badge will appear in Badges once it has been issued.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full max-w-56 gap-1.5 rounded-full"
            onClick={() => navigate('/badges')}
          >
            <Award className="size-4" aria-hidden />
            Open Badges
          </Button>
        </>
      )}
    </div>
  );
}
