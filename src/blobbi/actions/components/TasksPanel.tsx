// src/blobbi/actions/components/TasksPanel.tsx

/**
 * Generic UI component for displaying task progress.
 * Shows a list of tasks with progress indicators and action buttons.
 * Used for both hatch and evolve tasks.
 */

import { ExternalLink, Check, Loader2, ChevronRight, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

// ─── Task Row Component ───────────────────────────────────────────────────────

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
        window.open(task.actionTarget, '_blank', 'noopener,noreferrer');
        break;
      case 'open_modal':
        if (task.actionTarget === 'blobbi_post') {
          onOpenPostModal();
        }
        break;
    }
  };
  
  const progress = task.required > 1 
    ? Math.round((task.current / task.required) * 100)
    : task.completed ? 100 : 0;
  
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 sm:p-4 rounded-xl border transition-all overflow-hidden",
        task.completed 
          ? "bg-emerald-500/5 border-emerald-500/20" 
          : isDynamic
            ? "bg-amber-500/5 border-amber-500/20"
            : "bg-card/60 border-border hover:border-primary/30"
      )}
    >
      {/* Top row on mobile: Status + Task info */}
      <div className="flex items-start sm:items-center gap-3 sm:contents">
        {/* Status indicator */}
        <div className={cn(
          "size-8 sm:size-10 rounded-full flex items-center justify-center shrink-0",
          task.completed 
            ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
            : isDynamic
              ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
              : "bg-muted text-muted-foreground"
        )}>
          {task.completed ? (
            <Check className="size-4 sm:size-5" />
          ) : isDynamic ? (
            <AlertCircle className="size-4 sm:size-5" />
          ) : task.required > 1 ? (
            <span className="text-xs sm:text-sm font-medium">{task.current}/{task.required}</span>
          ) : (
            <span className="text-base sm:text-lg">○</span>
          )}
        </div>
        
        {/* Task info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
            <h4 className={cn(
              "font-medium text-sm sm:text-base break-words",
              task.completed && "text-emerald-600 dark:text-emerald-400",
              isDynamic && !task.completed && "text-amber-600 dark:text-amber-400"
            )}>
              {task.name}
            </h4>
            {task.completed && (
              <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs shrink-0">
                Complete
              </Badge>
            )}
            {isDynamic && !task.completed && (
              <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs shrink-0">
                Live
              </Badge>
            )}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground break-words">
            {task.description}
          </p>
          
          {/* Progress bar for multi-step tasks (not for dynamic stat tasks) */}
          {task.required > 1 && !task.completed && !isDynamic && (
            <Progress value={progress} className="h-1.5 mt-2" />
          )}
          
          {/* Dynamic task hint */}
          {isDynamic && !task.completed && (
            <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1">
              Lowest stat: {task.current}% (need {task.required}%+)
            </p>
          )}
        </div>
      </div>
      
      {/* Action button - full width on mobile when present */}
      {task.action && task.actionLabel && !task.completed && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAction}
          className="shrink-0 gap-2 w-full sm:w-auto mt-1 sm:mt-0"
        >
          <span className="truncate">{task.actionLabel}</span>
          {task.action === 'external_link' ? (
            <ExternalLink className="size-3.5 shrink-0" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" />
          )}
        </Button>
      )}
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
  emoji,
  title,
  description,
  completeLabel,
  completingLabel,
  completeEmoji,
}: TasksPanelProps) {
  const completedCount = tasks.filter(t => t.completed).length;
  const totalTasks = tasks.length;
  const overallProgress = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
  
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden">
      <CardHeader className="pb-3 sm:pb-4 px-3 sm:px-6">
        <div className="flex items-start sm:items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <span className="text-xl sm:text-2xl shrink-0">{emoji}</span>
              <span className="break-words">{title}</span>
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm break-words">
              {description}
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-sm sm:text-base px-2 sm:px-3 py-0.5 sm:py-1 shrink-0">
            {completedCount}/{totalTasks}
          </Badge>
        </div>
        
        {/* Overall progress */}
        <div className="mt-3 sm:mt-4">
          <div className="flex items-center justify-between text-xs sm:text-sm mb-2">
            <span className="text-muted-foreground">Overall progress</span>
            <span className="font-medium">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-2 sm:space-y-3 px-3 sm:px-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {tasks.map(task => (
              <TaskRow 
                key={task.id} 
                task={task} 
                onOpenPostModal={onOpenPostModal}
              />
            ))}
            
            {/* Complete button - only visible when all tasks complete */}
            {allCompleted && (
              <div className="pt-4 border-t border-border mt-4">
                <Button
                  onClick={onComplete}
                  disabled={isCompleting}
                  size="lg"
                  className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                >
                  {isCompleting ? (
                    <>
                      <Loader2 className="size-5 animate-spin" />
                      {completingLabel}
                    </>
                  ) : (
                    <>
                      <span className="text-xl">{completeEmoji}</span>
                      {completeLabel}
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
