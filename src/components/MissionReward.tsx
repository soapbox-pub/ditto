import { useEffect, useRef } from 'react';
import { Award, Check, Lock, Sparkles } from 'lucide-react';

import { missionDevCeremonyEntry } from '@/dev/missionHarness';
import { ExplorerRewardArt } from '@/components/MissionArt';
import { RewardCeremony } from '@/components/RewardCeremony';
import { Button } from '@/components/ui/button';
import { useBadgeClaim } from '@/hooks/useBadgeClaim';
import { useRewardCeremony, type RewardCeremonyPhase } from '@/hooks/useRewardCeremony';
import { DITTO_EXPLORER_BADGES_DESTINATION } from '@/lib/badgesTabs';
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
 * | `ready`     | "Journey complete", "Reveal your reward" (opens the ceremony)|
 * | `claiming`  | a claim already in flight; the action waits for it           |
 * | `claimed`   | "Badge claim submitted"; the reveal is still owed            |
 * | `revealed`  | the badge itself, its name, and a link to Badges. Terminal.  |
 * | `failed`    | "That didn't go through"; retry happens in the ceremony      |
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
 * It does not show the reward before it has been revealed. The badge artwork is
 * a picture of what the user has not earned yet, so every state up to and
 * including `claimed` shows it sealed. Taking the seal off is the ceremony's
 * job, and `revealedAt` is what says it happened; from there this panel shows
 * the badge plainly, forever.
 *
 * ### One way to claim
 *
 * The claim is submitted inside the ceremony, and only there. This panel used to
 * carry its own "Claim reward" button calling `claim()` directly, with no success
 * feedback at all: the one reward animation is bound to `ready`, so a successful
 * claim *removed* the only thing moving on screen. Keeping both would mean two
 * entry points to one irreversible act, and the quiet one would keep winning
 * because it was closer to hand.
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

/**
 * Localhost harness entries, mapped to the phase each one renders. `undefined`
 * means "use the ordinary entrance", which is what the two opening entries want.
 */
const DEV_CEREMONY_PHASE: Record<
  NonNullable<ReturnType<typeof missionDevCeremonyEntry>>,
  RewardCeremonyPhase | undefined
> = {
  opening: undefined,
  sealed: undefined,
  acting: 'acting',
  slow: 'acting',
  failed: 'failed',
  revealing: 'revealing',
  revealed: 'settled',
};

export function MissionReward({
  completedCount,
  totalCount,
  celebrating = false,
  ceremonyOpenable = false,
}: {
  completedCount: number;
  totalCount: number;
  /**
   * Whether the reward ceremony may be opened from here right now. Derived by
   * `useMissionSurfaceState` from the real mission state and passed in, so this
   * panel cannot invent its own eligibility rule — and so the ceremony stays
   * shut through the completion celebration, like every other reward attention.
   */
  ceremonyOpenable?: boolean;
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
  const { claim, markRewardRevealed, rewardView, isClaimed } = useBadgeClaim();
  const ceremony = useRewardCeremony({ claimSubmitted: isClaimed });
  const artRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef<HTMLButtonElement | null>(null);

  const view = rewardPresentation(rewardView, celebrating);

  // Localhost-only: enter the ceremony straight from the URL, so its frames can
  // be inspected without clicking through 4/4 first. `missionDevCeremonyEntry`
  // returns `undefined` in every production build and off localhost, so this
  // collapses to nothing there — and it can still only *open* the stage.
  const { open: openCeremony } = ceremony;
  useEffect(() => {
    const entry = missionDevCeremonyEntry();
    if (!entry || !ceremonyOpenable) return;
    openCeremony(artRef.current, {
      immediate: entry !== 'opening',
      // Every entry but the two entrance ones is a phase rendered directly. No
      // claim runs to reach them: the harness shows the stage, it does not act.
      phase: DEV_CEREMONY_PHASE[entry],
      slow: entry === 'slow',
    });
  }, [ceremonyOpenable, openCeremony]);
  const remaining = Math.max(0, totalCount - completedCount);
  const sealed = view === 'locked' || view === 'settling' || view === 'dismissed';

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
          finally shows the user their reward.

          While the ceremony holds this object, the panel keeps its space but
          stops painting it: the ceremony is showing the same reward, and two of
          them on screen at once would undo the whole point of the travel. Laid
          out rather than unmounted, so nothing reflows and the element stays
          measurable for the journey back. */}
      <div
        ref={artRef}
        className={cn(ceremony.isOpen && 'invisible')}
        aria-hidden={ceremony.isOpen || undefined}
      >
        <ExplorerRewardArt
          size={REWARD_ART_SIZE}
          ready={!sealed}
          revealed={view === 'revealed'}
          // A page that already knows the reward is revealed shows it revealed.
          // The choreography belongs to the ceremony and happens exactly once.
          instant
        />
      </div>

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
        <div className="space-y-1.5">
          <p className="text-base font-semibold text-foreground">Journey complete</p>
          <p className="text-sm text-muted-foreground">
            {view === 'failed'
              ? 'That claim didn’t go through. Nothing was lost, so you can try again.'
              : view === 'claiming'
                ? 'Your claim is on its way.'
                : 'Your special reward is ready.'}
          </p>
        </div>
      )}

      {view === 'claimed' && (
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
        </>
      )}

      {/* Terminal. The journey is over, the reward is out, and the page says so
          without pretending anything is still in progress: no spinner, no
          issuance meter, nothing waiting on a server Ditto cannot see. */}
      {view === 'revealed' && (
        <>
          <div className="space-y-1.5">
            <p className="text-base font-semibold text-foreground">Ditto Explorer</p>
            <p className="text-sm text-muted-foreground">
              Reward revealed. Your badge claim was submitted, and the badge will appear
              in Badges once it has been issued.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full max-w-56 gap-1.5 rounded-full"
            onClick={() => ceremony.leave(DITTO_EXPLORER_BADGES_DESTINATION)}
          >
            <Award className="size-4" aria-hidden />
            Open Badges
          </Button>
        </>
      )}

      {/* The one way to claim, now that the ceremony can actually do it.
          There used to be a "Claim reward" button here too, calling `claim()`
          directly. It had no success feedback of any kind — the only reward
          animation is bound to `ready`, so a successful claim *removed* the one
          thing moving on screen — and in the dev harness, where there is no
          signer, it silently returned `ineligible` and did nothing at all. Two
          entry points to one irreversible act, one of them mute, is worse than
          one that narrates itself.

          It renders for a submitted-but-unrevealed claim as well: the reveal is
          still owed, and the ceremony is where it will happen. */}
      {ceremonyOpenable && (
        <Button
          ref={openRef}
          type="button"
          size="sm"
          className="w-full max-w-56 gap-1.5 rounded-full font-semibold"
          onClick={() => ceremony.open(artRef.current, { trigger: openRef.current })}
        >
          <Sparkles className="size-4" aria-hidden />
          Reveal your reward
        </Button>
      )}

      <RewardCeremony
        phase={ceremony.phase}
        slow={ceremony.slow}
        failures={ceremony.failures}
        skipped={ceremony.skipped}
        rewardRevealed={view === 'revealed'}
        onReveal={() =>
          void ceremony.reveal({ submit: claim, markRevealed: markRewardRevealed })
        }
        onSkipReveal={ceremony.skipReveal}
        // Both "Open Badges" actions share one destination, so the panel and
        // the ceremony cannot drift apart about where they lead — and both go
        // through `leave`, which gives the ceremony's history entry back before
        // navigating so Back returns to the journey rather than bouncing off it.
        onOpenBadges={() => ceremony.leave(DITTO_EXPLORER_BADGES_DESTINATION)}
        sourceRect={ceremony.sourceRect}
        sourceElement={ceremony.sourceElement}
        onSettle={ceremony.settle}
        onRequestClose={ceremony.requestClose}
        onFinishClose={ceremony.finishClose}
      />
    </div>
  );
}
