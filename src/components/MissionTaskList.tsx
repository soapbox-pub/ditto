import {
  Bookmark,
  Check,
  ChevronRight,
  Heart,
  MessageCirclePlus,
  MessageSquare,
  Repeat2,
  Sparkles,
  UserPlus,
} from 'lucide-react';

import { useStartMissionTask } from '@/hooks/useStartMissionTask';
import type { PostInteractionKind } from '@/lib/postInteraction';
import {
  interactionSuccessMessage,
  POST_ONBOARDING_PATHS,
  POST_ONBOARDING_PATH_IDS,
  type PostOnboardingGuideState,
  type PostOnboardingPathId,
} from '@/lib/postOnboardingGuide';
import { cn } from '@/lib/utils';

const TASK_ICONS: Record<PostOnboardingPathId, React.ComponentType<{ className?: string }>> = {
  'find-people': UserPlus,
  'post-small': MessageCirclePlus,
  customize: Sparkles,
  interact: Heart,
};

/**
 * The mark left next to a completed `interact` task: the icon of the action
 * that actually finished it, so the row reads back the user's own choice rather
 * than a uniform tick.
 */
const INTERACTION_ICONS: Record<
  PostInteractionKind,
  React.ComponentType<{ className?: string }>
> = {
  reaction: Heart,
  reply: MessageSquare,
  repost: Repeat2,
  bookmark: Bookmark,
};

interface MissionTaskListProps {
  state: PostOnboardingGuideState;
  /** Whether missions can still be started. */
  interactive: boolean;
  /** Show each mission's "what completes this" hint. */
  showHints?: boolean;
  /**
   * The mission the journey suggests doing next. Marked as a recommendation,
   * never as a prerequisite: any unfinished mission can be started at any time.
   */
  nextPath?: PostOnboardingPathId;
  /** The mission the user has actually launched and not yet finished. */
  inProgressPath?: PostOnboardingPathId;
}

/**
 * The journey's missions — the rows, their state, and what a tap does.
 *
 * Tapping a mission only *starts* it (navigation, via `useStartMissionTask`);
 * nothing here completes anything. Optional hints spell out what actually
 * finishes each one, so the list stays honest about the fact that arriving on a
 * page is not progress.
 *
 * ### Three ways a row can stand out, and only one at a time
 *
 * A mission the user has launched reads "In progress" and offers *Continue*.
 * When nothing is in flight, the recommended mission reads "Next up" and offers
 * *Start*. Everything else unfinished is a plain, fully tappable row: the order
 * is a suggestion, not a gate, and the rows must not imply otherwise.
 *
 * Completed rows stay legible rather than being greyed out of existence. Three
 * finished missions beside one remaining should read as momentum, not as a wall
 * of disabled controls, so they keep their label at full contrast and say
 * "Completed" in words rather than relying on a tick and a colour.
 */
export function MissionTaskList({
  state,
  interactive,
  showHints = false,
  nextPath,
  inProgressPath,
}: MissionTaskListProps) {
  const startMissionTask = useStartMissionTask();

  return (
    <ol className="space-y-2">
      {POST_ONBOARDING_PATH_IDS.map((pathId) => {
        const meta = POST_ONBOARDING_PATHS[pathId];
        const done = state.paths[pathId] === 'completed';
        const actionable = interactive && !done;
        // A finished `interact` mission describes what the user did instead of
        // repeating the four options they no longer need to choose between.
        const interaction = pathId === 'interact' && done ? state.interact : undefined;
        const Icon = interaction ? INTERACTION_ICONS[interaction.action] : TASK_ICONS[pathId];

        const inProgress = actionable && pathId === inProgressPath;
        // Only when nothing is actually in flight: two competing "do this one"
        // markers would be worse than none.
        const recommended = actionable && !inProgressPath && pathId === nextPath;
        const highlighted = inProgress || recommended;

        return (
          <li key={pathId}>
            <button
              type="button"
              onClick={() => startMissionTask(pathId)}
              disabled={!actionable}
              aria-current={inProgress ? 'step' : undefined}
              className={cn(
                'group flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                done && 'cursor-default border-transparent bg-muted/40',
                highlighted && 'border-primary/50 bg-primary/[0.06]',
                actionable &&
                  !highlighted &&
                  'border-border/70 hover:border-primary/40 hover:bg-accent',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full',
                  done && 'bg-primary/15 text-primary',
                  highlighted && 'bg-primary text-primary-foreground',
                  !done && !highlighted && 'bg-muted text-muted-foreground',
                )}
              >
                {done && !interaction ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <Icon className="size-4" aria-hidden />
                )}
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-foreground">{meta.label}</span>
                  {inProgress && (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      In progress
                    </span>
                  )}
                  {recommended && (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      Next up
                    </span>
                  )}
                </span>

                <span
                  className={cn(
                    'text-xs',
                    interaction ? 'font-medium text-primary' : 'text-muted-foreground',
                  )}
                >
                  {done
                    ? interaction
                      ? interactionSuccessMessage(interaction.action)
                      : 'Completed'
                    : meta.description}
                </span>

                {showHints && !done && (
                  <span className="text-[11px] leading-snug text-muted-foreground/80">
                    {meta.completionHint}
                  </span>
                )}
              </span>

              {actionable && (
                <span
                  className={cn(
                    'mt-1 flex shrink-0 items-center gap-1 text-xs font-semibold',
                    highlighted ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <span className={cn(!highlighted && 'sr-only')}>
                    {inProgress ? 'Continue' : 'Start'}
                  </span>
                  <ChevronRight className="size-4" aria-hidden />
                </span>
              )}

            </button>
          </li>
        );
      })}
    </ol>
  );
}
