import {
  Bookmark,
  Check,
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
  /** Whether tasks can still be started. */
  interactive: boolean;
  /** Two-column grid (feed card) vs. a single column (page, sidebar). */
  columns?: 1 | 2;
  /** Show each task's "what completes this" hint. */
  showHints?: boolean;
  /** Fired when a task is started, e.g. to silence an attention cue. */
  onStart?: () => void;
}

/**
 * The mission's task list, shared by the feed card and the `/missions` page so
 * the two can't drift apart in labelling, ordering, or what a tap does.
 *
 * Tapping a task only *starts* it (navigation); nothing here completes
 * anything. Optional hints spell out what actually finishes each task, so the
 * list is honest about the fact that arriving on a page isn't progress.
 */
export function MissionTaskList({
  state,
  interactive,
  columns = 1,
  showHints = false,
  onStart,
}: MissionTaskListProps) {
  const startMissionTask = useStartMissionTask(onStart);

  return (
    <ul className={cn('gap-2', columns === 2 ? 'grid auto-rows-fr sm:grid-cols-2' : 'space-y-2')}>
      {POST_ONBOARDING_PATH_IDS.map((pathId) => {
        const meta = POST_ONBOARDING_PATHS[pathId];
        const done = state.paths[pathId] === 'completed';
        const disabled = !interactive || done;
        // A finished `interact` task describes what the user did instead of
        // repeating the four options they no longer need to choose between.
        const interaction = pathId === 'interact' && done ? state.interact : undefined;
        const Icon = interaction
          ? INTERACTION_ICONS[interaction.action]
          : TASK_ICONS[pathId];
        return (
          <li key={pathId} className={columns === 2 ? 'flex' : undefined}>
            <button
              type="button"
              onClick={() => startMissionTask(pathId)}
              disabled={disabled}
              className={cn(
                'group flex h-full w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                done ? 'border-primary/30 bg-primary/5' : 'hover:border-primary/50 hover:bg-accent',
                disabled && 'cursor-default',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
                  done ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
                )}
              >
                {done && !interaction ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <Icon className="size-4" aria-hidden />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {meta.label}
                  {done && <span className="sr-only">(completed)</span>}
                </span>
                <span
                  className={cn(
                    'mt-0.5 text-xs',
                    interaction ? 'font-medium text-primary' : 'text-muted-foreground',
                  )}
                >
                  {interaction
                    ? interactionSuccessMessage(interaction.action)
                    : meta.description}
                </span>
                {showHints && !done && (
                  <span className="mt-1 text-[11px] leading-snug text-primary/80">
                    {meta.completionHint}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
