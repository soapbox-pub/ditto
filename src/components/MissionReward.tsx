import { useNavigate } from 'react-router-dom';
import { Award, Check, Clock, Loader2, Lock, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useBadgeClaim } from '@/hooks/useBadgeClaim';
import {
  DITTO_EXPLORER_BADGE_IMAGE,
  DITTO_EXPLORER_BADGE_NAME,
} from '@/lib/badgeClaim';
import { POST_ONBOARDING_PATH_IDS } from '@/lib/postOnboardingGuide';
import { cn } from '@/lib/utils';

/**
 * The single reward surface for the Ditto Explorer badge, shared by the feed
 * card and the `/missions` page so the claim lifecycle is described in exactly
 * one place.
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
export function MissionReward({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const { claim, rewardView, isClaiming } = useBadgeClaim();

  if (rewardView === 'locked') {
    return (
      <div
        className={cn(
          'flex items-center rounded-lg border border-dashed border-primary/30 bg-primary/5',
          compact ? 'gap-2.5 p-2.5' : 'gap-3 p-3',
        )}
      >
        <div className="relative shrink-0">
          <img
            src={DITTO_EXPLORER_BADGE_IMAGE}
            alt=""
            aria-hidden
            loading="lazy"
            className={cn(
              'rounded-lg object-cover opacity-60 grayscale ring-1 ring-primary/20',
              compact ? 'size-10' : 'size-14',
            )}
          />
          <span
            className={cn(
              'absolute -bottom-1 -right-1 flex items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm ring-1 ring-border',
              compact ? 'size-4' : 'size-5',
            )}
          >
            <Lock className={compact ? 'size-2.5' : 'size-3'} aria-hidden />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'font-semibold leading-snug text-foreground',
              compact ? 'text-xs' : 'text-sm',
            )}
          >
            Earn the {DITTO_EXPLORER_BADGE_NAME} badge
          </p>
          <p className={cn('text-muted-foreground', compact ? 'text-[11px] leading-snug' : 'text-xs')}>
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
    <div
      className={cn(
        'flex flex-col items-center rounded-lg border border-primary/30 bg-primary/5 text-center',
        compact ? 'gap-2 p-3' : 'gap-3 p-4',
      )}
    >
      <img
        src={DITTO_EXPLORER_BADGE_IMAGE}
        alt={`${DITTO_EXPLORER_BADGE_NAME} badge`}
        loading="lazy"
        className={cn(
          'rounded-xl object-cover shadow-sm ring-1 ring-primary/20',
          compact ? 'size-14' : 'size-20',
        )}
      />

      {rewardView === 'claimed' ? (
        <>
          <div className="space-y-0.5">
            <p
              className={cn(
                'flex items-center justify-center gap-1.5 font-semibold text-foreground',
                compact ? 'text-sm' : 'text-base',
              )}
            >
              <Check className="size-4 shrink-0 text-primary" aria-hidden />
              Badge claimed
            </p>
            <p
              className={cn(
                'flex items-center justify-center gap-1.5 text-muted-foreground',
                compact ? 'text-xs' : 'text-sm',
              )}
            >
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
            <p
              className={cn('font-semibold text-foreground', compact ? 'text-sm' : 'text-base')}
            >
              You unlocked the {DITTO_EXPLORER_BADGE_NAME} badge
            </p>
            <p className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
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
