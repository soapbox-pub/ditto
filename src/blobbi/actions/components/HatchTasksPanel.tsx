// src/blobbi/actions/components/HatchTasksPanel.tsx

/**
 * UI component for displaying hatch task progress.
 * Shows a list of tasks with progress indicators and action buttons.
 */

import { ExternalLink, Check, Loader2, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { openUrl } from '@/lib/downloadFile';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import type { HatchTask } from '../hooks/useHatchTasks';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HatchTasksPanelProps {
  tasks: HatchTask[];
  allCompleted: boolean;
  isLoading: boolean;
  /** Called when all tasks are complete and user clicks "Hatch" */
  onHatch: () => void;
  /** Whether hatching is in progress */
  isHatching?: boolean;
}

// ─── Task Row Component ───────────────────────────────────────────────────────

interface TaskRowProps {
  task: HatchTask;
}

function TaskRow({ task }: TaskRowProps) {
  const navigate = useNavigate();
  
  const handleAction = () => {
    if (!task.action || !task.actionTarget) return;
    
    switch (task.action) {
      case 'navigate':
        navigate(task.actionTarget);
        break;
      case 'external_link':
        openUrl(task.actionTarget);
        break;
    }
  };
  
  const progress = task.required > 1 
    ? Math.round((task.current / task.required) * 100)
    : task.completed ? 100 : 0;
  
  return (
    <div
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl border transition-all",
        task.completed 
          ? "bg-emerald-500/5 border-emerald-500/20" 
          : "bg-card/60 border-border hover:border-primary/30"
      )}
    >
      {/* Status indicator */}
      <div className={cn(
        "size-10 rounded-full flex items-center justify-center shrink-0",
        task.completed 
          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
          : "bg-muted text-muted-foreground"
      )}>
        {task.completed ? (
          <Check className="size-5" />
        ) : task.required > 1 ? (
          <span className="text-sm font-medium">{task.current}/{task.required}</span>
        ) : (
          <span className="text-lg">○</span>
        )}
      </div>
      
      {/* Task info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className={cn(
            "font-medium",
            task.completed && "text-emerald-600 dark:text-emerald-400"
          )}>
            {task.name}
          </h4>
          {task.completed && (
            <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs">
              Complete
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {task.description}
        </p>
        
        {/* Progress bar for multi-step tasks */}
        {task.required > 1 && !task.completed && (
          <Progress value={progress} className="h-1.5 mt-2" />
        )}
      </div>
      
      {/* Action button */}
      {task.action && task.actionLabel && !task.completed && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAction}
          className="shrink-0 gap-2"
        >
          {task.actionLabel}
          {task.action === 'external_link' ? (
            <ExternalLink className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </Button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function HatchTasksPanel({
  tasks,
  allCompleted,
  isLoading,
  onHatch,
  isHatching = false,
}: HatchTasksPanelProps) {
  const completedCount = tasks.filter(t => t.completed).length;
  const totalTasks = tasks.length;
  const overallProgress = Math.round((completedCount / totalTasks) * 100);
  
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span className="text-2xl">🥚</span>
              Hatch Tasks
            </CardTitle>
            <CardDescription>
              Complete these tasks to hatch your Blobbi
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-base px-3 py-1">
            {completedCount}/{totalTasks}
          </Badge>
        </div>
        
        {/* Overall progress */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">Overall progress</span>
            <span className="font-medium">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
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
              />
            ))}
            
            {/* Hatch button - only visible when all tasks complete */}
            {allCompleted && (
              <div className="pt-4 border-t border-border mt-4">
                <Button
                  onClick={onHatch}
                  disabled={isHatching}
                  size="lg"
                  className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                >
                  {isHatching ? (
                    <>
                      <Loader2 className="size-5 animate-spin" />
                      Hatching...
                    </>
                  ) : (
                    <>
                      <span className="text-xl">🐣</span>
                      Hatch Your Blobbi!
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
