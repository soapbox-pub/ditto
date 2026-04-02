// src/blobbi/actions/components/TasksPanel.tsx

/**
 * Task list for hatch / evolve quests.
 *
 * Redesigned to be flat and lightweight — no nested Card chrome.
 * Each task is a minimal row with a clear status indicator.
 * The CTA button anchors the bottom of the list when all tasks are done.
 */

import { ExternalLink, Check, Loader2, ChevronRight, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { openUrl } from '@/lib/downloadFile';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

import type { HatchTask } from '../hooks/useHatchTasks';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TasksPanelProps {
  tasks: HatchTask[];
  allCompleted: boolean;
  isLoading: boolean;
  /** Called when user clicks "Create Post" action */
  onOpenPostModal: () => void;
  /** Called when all tasks are complete and user clicks the complete button */
  onComplete: () => void;
  /** Whether completion is in progress */
  isCompleting?: boolean;
  /** Emoji to show in header */
  emoji: string;
  /** Title for the tasks panel */
  title: string;
  /** Description for the tasks panel */
  description: string;
  /** Label for the complete button */
  completeLabel: string;
  /** Label while completing */
  completingLabel: string;
  /** Emoji for complete button */
  completeEmoji: string;
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: HatchTask;
  onOpenPostModal: () => void;
}

function TaskRow({ task, onOpenPostModal }: TaskRowProps) {
  const navigate = useNavigate();
  const isDynamic = task.type === 'dynamic';

  const handleAction = () => {
    if (!task.action || !task.actionTarget) return;

    switch (task.action) {
      case 'navigate':
        navigate(task.actionTarget);
        break;
      case 'external_link':
        openUrl(task.actionTarget);
        break;
      case 'open_modal':
        if (task.actionTarget === 'blobbi_post') {
          onOpenPostModal();
        }
        break;
    }
  };

  const progress =
    task.required > 1
      ? Math.round((task.current / task.required) * 100)
      : task.completed
        ? 100
        : 0;

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-xl transition-colors',
        task.completed
          ? 'bg-emerald-500/5'
          : isDynamic
            ? 'bg-amber-500/5'
            : 'bg-muted/40',
      )}
    >
      {/* Status indicator — small circle */}
      <div
        className={cn(
          'size-7 rounded-full flex items-center justify-center shrink-0 mt-0.5',
          task.completed
            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
            : isDynamic
              ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
              : 'bg-muted text-muted-foreground',
        )}
      >
        {task.completed ? (
          <Check className="size-3.5" />
        ) : isDynamic ? (
          <AlertCircle className="size-3.5" />
        ) : task.required > 1 ? (
          <span className="text-[10px] font-semibold tabular-nums">
            {task.current}/{task.required}
          </span>
        ) : (
          <span className="size-2 rounded-full bg-current opacity-30" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className={cn(
              'text-sm font-medium leading-tight',
              task.completed && 'text-emerald-600 dark:text-emerald-400',
              isDynamic && !task.completed && 'text-amber-600 dark:text-amber-400',
            )}
          >
            {task.name}
          </span>
          {isDynamic && !task.completed && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500 dark:text-amber-400">
              Live
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-snug">{task.description}</p>

        {/* Progress bar for multi-step non-dynamic tasks */}
        {task.required > 1 && !task.completed && !isDynamic && (
          <Progress value={progress} className="h-1 mt-2" />
        )}

        {/* Dynamic stat hint */}
        {isDynamic && !task.completed && (
          <p className="text-[11px] text-amber-600/70 dark:text-amber-400/70 mt-1">
            Lowest stat: {task.current}% (need {task.required}%+)
          </p>
        )}

        {/* Inline action link */}
        {task.action && task.actionLabel && !task.completed && (
          <button
            onClick={handleAction}
            className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-primary hover:underline"
          >
            {task.actionLabel}
            {task.action === 'external_link' ? (
              <ExternalLink className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TasksPanel({
  tasks,
  allCompleted,
  isLoading,
  onOpenPostModal,
  onComplete,
  isCompleting = false,
  completeLabel,
  completingLabel,
  completeEmoji,
}: TasksPanelProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} onOpenPostModal={onOpenPostModal} />
      ))}

      {/* CTA — anchors at the bottom when all tasks are done */}
      {allCompleted && (
        <div className="pt-3">
          <Button
            onClick={onComplete}
            disabled={isCompleting}
            size="lg"
            className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm"
          >
            {isCompleting ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                {completingLabel}
              </>
            ) : (
              <>
                <span className="text-lg">{completeEmoji}</span>
                {completeLabel}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
