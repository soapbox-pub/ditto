import { FormattedMessage } from 'react-intl';
import { Play, RotateCcw, Target } from 'lucide-react';

import { DittoExplorerIntroduction } from '@/components/DittoExplorerIntroduction';
import { missionDevActive } from '@/dev/missionHarness';
import { LoginArea } from '@/components/auth/LoginArea';
import { ExplorerJourneyMark } from '@/components/MissionArt';
import { MissionJourney } from '@/components/MissionJourney';
import { MissionReward } from '@/components/MissionReward';
import { MissionTaskList } from '@/components/MissionTaskList';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMissionSurfaceState } from '@/hooks/useMissionSurfaceState';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { DITTO_EXPLORER_BADGE_NAME } from '@/lib/badgeClaim';
import {
  POST_ONBOARDING_PATH_IDS,
  type PostOnboardingGuideState,
} from '@/lib/postOnboardingGuide';

/**
 * Missions — the durable home for the user's journeys through Ditto.
 *
 * Every other mission surface is transient by design: the sidebar widget can be
 * hidden, and both it and the mobile teaser self-hide once the reward has been
 * claimed. This page is always reachable and always shows the real state,
 * including the ones the compact surfaces hide (hidden journeys, claimed
 * rewards, failed claims). That separation is what lets the prompts stay quiet
 * without the journey becoming unreachable.
 *
 * ### Why the page is not the Ditto Explorer detail page
 *
 * The route is plural, and the shell is built that way: the page owns the
 * destination framing, and a `MissionJourney` owns everything about a journey.
 * Today exactly one is rendered. A second is another instance rather than a
 * restructure. There is deliberately no placeholder for journeys that do not
 * exist: an empty "coming soon" slot is clutter that makes the page look
 * unfinished rather than extensible.
 *
 * It still reuses the same state, missions and reward panel as every other
 * surface, so no copy of the journey's rules lives here.
 */

/**
 * How to say where the journey stands, when that is worth saying at all.
 *
 * A journey that is simply underway needs no label: the count and the bar
 * beside it already say `2/4`, and a chip repeating "in progress" would both
 * add noise and collide with the marker the *mission* rows use for a guided
 * flow that is actually in flight.
 */
function journeyStatus({
  isDismissed,
  introOutstanding,
  allCompleted,
  completedCount,
}: {
  isDismissed: boolean;
  introOutstanding: boolean;
  allCompleted: boolean;
  completedCount: number;
}): string | undefined {
  if (isDismissed) return 'Hidden';
  if (allCompleted) return 'Complete';
  if (introOutstanding && completedCount === 0) return 'Not started';
  return undefined;
}

/**
 * The mission the user has actually launched and not finished.
 *
 * Both halves are required: `startPath` writes `activePath` *and* moves that
 * mission to `active`, so a genuinely-in-flight guided flow has both. Reading
 * only `activePath` would keep saying "in progress" about something the user
 * merely tapped once and abandoned.
 */
function inProgressPath(state: PostOnboardingGuideState | undefined) {
  const active = state?.activePath;
  if (!active) return undefined;
  if (!POST_ONBOARDING_PATH_IDS.includes(active)) return undefined;
  return state?.paths[active] === 'active' ? active : undefined;
}

export function MissionsPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  useSeoMeta({
    title: `Missions | ${config.appName}`,
    description: 'Small journeys that help you discover Ditto and make it your own.',
  });

  const {
    state,
    isLoading,
    isActive,
    isDismissed,
    completedCount,
    totalCount,
    allCompleted,
    introOutstanding,
    canShowDetail,
    nextPath,
    resumeGuide,
    resetGuideDev,
    celebrating,
  } = useMissionSurfaceState();

  // DEV-only reset so the whole journey and claim flow can be re-run without a
  // fresh account. `import.meta.env.DEV` is statically false in production, so
  // this renders nothing there; `resetGuideDev` is a no-op in prod anyway.
  const devReset = import.meta.env.DEV ? (
    <div className="flex justify-end">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => void resetGuideDev()}
        title="DEV only: reset this account's first journey"
      >
        <RotateCcw className="size-3.5" aria-hidden />
        Reset journey
      </Button>
    </div>
  ) : null;

  return (
    <main>
      <PageHeader title="Missions" icon={<Target className="size-5" />} />

      <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-2">
        {!user && !missionDevActive() ? (
          <div className="flex flex-col items-center gap-6 px-4 py-20 text-center">
            <ExplorerJourneyMark className="size-16" />
            <div className="max-w-sm space-y-2">
              <h2 className="text-xl font-bold">Your journeys start here</h2>
              <p className="text-sm text-muted-foreground">
                Log in to begin your first journey through Ditto and earn the{' '}
                {DITTO_EXPLORER_BADGE_NAME} badge.
              </p>
            </div>
            <LoginArea className="max-w-60" />
          </div>
        ) : isLoading && !state ? (
          <div className="space-y-5 py-4">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <div className="space-y-2">
                {POST_ONBOARDING_PATH_IDS.map((id) => (
                  <Skeleton key={id} className="h-[74px] w-full rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-72 w-full rounded-2xl" />
            </div>
          </div>
        ) : (
          <>
            {/* The destination's own framing. The app header above already
                carries "Missions" as the page title, so this says what the
                place is for rather than repeating its name. */}
            <header className="max-w-2xl space-y-2 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Your journeys
              </p>
              <p className="text-base leading-relaxed text-muted-foreground">
                Small journeys that help you discover Ditto, meet people, and make the
                experience your own.
              </p>
            </header>

            <MissionJourney
              eyebrow={DITTO_EXPLORER_BADGE_NAME}
              title="Your first journey through Ditto"
              description="Four small missions to meet people, share something, make Ditto yours, and join in with the community."
              mark={<ExplorerJourneyMark className="size-14 sm:size-16" />}
              status={journeyStatus({
                isDismissed,
                introOutstanding,
                allCompleted,
                completedCount,
              })}
              completedCount={completedCount}
              totalCount={totalCount}
              celebrating={celebrating}
              missions={
                <>
                  {/* Hidden journey: the resume path. Hiding used to be terminal
                      in production while the UI promised it could be picked back
                      up here. This is that promise, kept. */}
                  {isDismissed && (
                    <div className="mb-3 space-y-3 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center">
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
                        <FormattedMessage
                          id="mission.hidden.resume"
                          defaultMessage="Resume mission"
                        />
                      </Button>
                    </div>
                  )}

                  {/* The introduction, while it is still owed. Mission rows stay
                      hidden until it is acknowledged, so a first encounter is an
                      invitation rather than a checklist. */}
                  {!isDismissed && introOutstanding && (
                    <DittoExplorerIntroduction variant="page" />
                  )}

                  {state && (canShowDetail || isDismissed) && (
                    <MissionTaskList
                      state={state}
                      interactive={isActive}
                      showHints
                      nextPath={nextPath}
                      inProgressPath={inProgressPath(state)}
                    />
                  )}
                </>
              }
              reward={
                !isDismissed && canShowDetail ? (
                  <MissionReward
                    completedCount={completedCount}
                    totalCount={totalCount}
                    // The reward waits out the completion celebration rather
                    // than opening on top of it. Same flag the hero uses, so the
                    // two cannot disagree about when the moment ends.
                    celebrating={celebrating}
                  />
                ) : undefined
              }
              footer={devReset}
            />
          </>
        )}
      </div>
    </main>
  );
}
