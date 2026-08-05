import { FormattedMessage } from 'react-intl';
import { Play, RotateCcw, Sparkles, Target } from 'lucide-react';

import { DittoExplorerIntroduction } from '@/components/DittoExplorerIntroduction';
import { missionDevActive } from '@/dev/missionHarness';
import { LoginArea } from '@/components/auth/LoginArea';
import { MissionCelebrationSparkle } from '@/components/MissionCelebrationSparkle';
import { MissionReward } from '@/components/MissionReward';
import { MissionTaskList } from '@/components/MissionTaskList';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMissionCelebration } from '@/hooks/useMissionCelebration';
import { usePostOnboardingGuide } from '@/hooks/usePostOnboardingGuide';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { DITTO_EXPLORER_BADGE_NAME } from '@/lib/badgeClaim';
import { POST_ONBOARDING_PATH_IDS } from '@/lib/postOnboardingGuide';
import { cn } from '@/lib/utils';

/**
 * The Missions page — the mission's durable home.
 *
 * Every other surface is transient by design: the feed card can be hidden, the
 * teasers self-hide once the reward is claimed. This page is always reachable
 * and always reflects the real state, including the ones the teasers hide:
 * dismissed missions, claimed rewards, and failed claims. That separation is
 * what lets the prompts stay quiet without the mission becoming unreachable.
 *
 * It reuses the same mission state, task list, and reward panel as every other
 * surface, so there is no second copy of the mission's rules living here.
 */
const MISSION_DESCRIPTION =
  'Take your first steps through Ditto. Complete these to unlock your first badge.';

export function MissionsPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  useSeoMeta({
    title: `Missions | ${config.appName}`,
    description: 'Complete missions to explore Ditto and earn rewards.',
  });

  const {
    state,
    isLoading,
    isActive,
    isDismissed,
    completedCount,
    totalCount,
    introOutstanding,
    canShowDetail,
    resumeGuide,
    resetGuideDev,
  } = usePostOnboardingGuide();

  const { celebrating } = useMissionCelebration();

  const progressValue = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // DEV-only reset so the whole mission + claim flow can be re-run without a
  // fresh account. `import.meta.env.DEV` is statically false in production, so
  // the bundler drops this branch; `resetGuideDev` is a no-op in prod anyway.
  const devResetButton = import.meta.env.DEV ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="gap-1.5 text-muted-foreground hover:text-foreground"
      onClick={() => void resetGuideDev()}
      title="DEV only: reset this account's first mission"
    >
      <RotateCcw className="size-3.5" aria-hidden />
      Reset mission
    </Button>
  ) : null;

  return (
    <main>
      <PageHeader title="Missions" icon={<Target className="size-5" />} />

      {!user && !missionDevActive() ? (
        <div className="flex flex-col items-center gap-6 px-8 py-20 text-center">
          <div className="rounded-full bg-primary/10 p-4">
            <Target className="size-8 text-primary" aria-hidden />
          </div>
          <div className="max-w-xs space-y-2">
            <h2 className="text-xl font-bold">Missions</h2>
            <p className="text-sm text-muted-foreground">
              Log in to start your first mission and earn the {DITTO_EXPLORER_BADGE_NAME} badge.
            </p>
          </div>
          <LoginArea className="max-w-60" />
        </div>
      ) : isLoading && !state ? (
        <div className="mx-auto max-w-xl px-4 py-6">
          <Card className="overflow-hidden">
            <CardHeader className="space-y-3 p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-64" />
              <Skeleton className="h-2 w-full rounded-full" />
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0">
              {POST_ONBOARDING_PATH_IDS.map((id) => (
                <Skeleton key={id} className="h-14 w-full rounded-lg" />
              ))}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="mx-auto max-w-xl px-4 py-6">
          <Card
            className={cn(
              'overflow-hidden border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card',
              celebrating && 'mission-celebrate',
            )}
          >
            <CardHeader className="space-y-3 p-4 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                    <Sparkles className="size-3 shrink-0" aria-hidden />
                    First mission
                  </span>
                  <h2 className="text-lg font-bold leading-tight text-foreground">
                    {DITTO_EXPLORER_BADGE_NAME}
                  </h2>
                  <p className="text-sm text-muted-foreground">{MISSION_DESCRIPTION}</p>
                </div>
                <div className="relative shrink-0">
                  <span
                    className={cn(
                      'block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary',
                      celebrating && 'mission-count-pop',
                    )}
                    aria-label={`${completedCount} of ${totalCount} complete`}
                  >
                    {completedCount}/{totalCount}
                  </span>
                  <MissionCelebrationSparkle active={celebrating} />
                </div>
              </div>
              <Progress
                value={progressValue}
                className={cn('h-2', celebrating && 'mission-progress-glow')}
                aria-label={`Mission progress: ${completedCount} of ${totalCount} steps complete`}
              />
            </CardHeader>

            <CardContent className="space-y-4 p-4 pt-0">
              {/* Hidden mission: the resume path. Hiding used to be terminal in
                  production while the UI promised it could be picked back up
                  here — this is that promise, kept. */}
              {isDismissed && (
                <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      <FormattedMessage
                        id="mission.hidden.title"
                        defaultMessage="This mission is hidden."
                      />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {completedCount > 0 ? (
                        <FormattedMessage
                          id="mission.hidden.progress"
                          defaultMessage="You completed {done} of {total} steps. Nothing was lost."
                          values={{ done: completedCount, total: totalCount }}
                        />
                      ) : (
                        <FormattedMessage
                          id="mission.hidden.empty"
                          defaultMessage="You can pick it back up whenever you like."
                        />
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5 rounded-full font-semibold"
                    onClick={() => void resumeGuide()}
                  >
                    <Play className="size-4" aria-hidden />
                    <FormattedMessage id="mission.hidden.resume" defaultMessage="Resume mission" />
                  </Button>
                </div>
              )}

              {/* Introduction, while it is still owed. Task rows stay hidden
                  until it is acknowledged, so a first encounter is an
                  invitation rather than a checklist. */}
              {!isDismissed && introOutstanding && <DittoExplorerIntroduction variant="page" />}

              {/* Reward: locked preview, claim UI, claimed, retry after a
                  failure — all of it, once the introduction is behind us. */}
              {!isDismissed && canShowDetail && <MissionReward />}

              {state && (canShowDetail || isDismissed) && (
                <MissionTaskList state={state} interactive={isActive} showHints />
              )}

              {devResetButton && <div className="flex justify-end pt-1">{devResetButton}</div>}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
