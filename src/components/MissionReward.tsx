import { useNavigate } from 'react-router-dom';
import { Award, Check, Clock, Loader2, RotateCcw } from 'lucide-react';

import { ExplorerBadgeArt } from '@/components/DittoExplorerVisual';
import { Button } from '@/components/ui/button';
import { useBadgeClaim } from '@/hooks/useBadgeClaim';
import { DITTO_EXPLORER_BADGE_NAME } from '@/lib/badgeClaim';
import { POST_ONBOARDING_PATH_IDS } from '@/lib/postOnboardingGuide';

/**
 * The single reward surface for the Ditto Explorer badge. It lives on
 * `/missions`, and the claim lifecycle is described here and nowhere else.
 *
 * It renders every state the claim can actually be in, and never blurs two of
 * them together:
 *
 * | State       | What the user sees                                          |
 * |-------------|-------------------------------------------------------------|
 * | `locked`    | dimmed, padlocked badge — "complete N steps to unlock"       |
 * | `ready`     | full-colour badge + "Claim Badge"                            |
 * | `claiming`  | spinner + "Claiming…", button disabled                       |
 * | `claimed`   | "Badge claimed · award pending" + a link to Badges           |
 * | `failed`    | "That didn't go through" + "Try again"                       |
 * | `dismissed` | quiet note that the mission was dismissed                    |
 *
 * `claimed` deliberately says *award pending*, not "you have the badge": the
 * claim is a public request (kind 30637) and the NIP-58 award is issued later,
 * server-side. Showing the celebration while implying the badge is already in
 * their profile would be a lie the Badges page would immediately contradict.
 */
export function MissionReward() {
  const navigate = useNavigate();
  const { claim, rewardView, isClaiming } = useBadgeClaim();

  if (rewardView === 'locked') {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
        <ExplorerBadgeArt
          className="size-14 rounded-lg opacity-60 grayscale"
          lock={{ badgeClassName: 'size-5', iconClassName: 'size-3' }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Earn the {DITTO_EXPLORER_BADGE_NAME} badge
          </p>
          <p className="text-xs text-muted-foreground">
            Complete these {POST_ONBOARDING_PATH_IDS.length} steps to unlock your first Ditto badge.
          </p>
        </div>
      </div>
    );
  }

  if (rewardView === 'dismissed') {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
        <p className="text-sm font-medium text-foreground">You dismissed this mission.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Your progress is kept — nothing was lost.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
      <ExplorerBadgeArt
        alt={`${DITTO_EXPLORER_BADGE_NAME} badge`}
        className="size-20 rounded-xl shadow-sm"
      />

      {rewardView === 'claimed' ? (
        <>
          <div className="space-y-0.5">
            <p className="flex items-center justify-center gap-1.5 text-base font-semibold text-foreground">
              <Check className="size-4 shrink-0 text-primary" aria-hidden />
              Badge claimed
            </p>
            <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="size-3.5 shrink-0" aria-hidden />
              Award pending — you’ll be notified.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate('/badges')}
          >
            <Award className="size-4" aria-hidden />
            Open Badges
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-0.5">
            <p className="text-base font-semibold text-foreground">
              You unlocked the {DITTO_EXPLORER_BADGE_NAME} badge
            </p>
            <p className="text-sm text-muted-foreground">
              {rewardView === 'failed'
                ? 'That claim didn’t go through. Nothing was lost — you can try again.'
                : 'Claim it to mark your first journey through Ditto.'}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="w-full max-w-xs gap-1.5"
            disabled={isClaiming}
            onClick={() => void claim()}
          >
            {isClaiming ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Claiming…
              </>
            ) : rewardView === 'failed' ? (
              <>
                <RotateCcw className="size-4" aria-hidden />
                Try again
              </>
            ) : (
              <>
                <Award className="size-4" aria-hidden />
                Claim Badge
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}
