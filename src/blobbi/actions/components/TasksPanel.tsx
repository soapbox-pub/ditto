// src/blobbi/actions/components/TasksPanel.tsx

/**
 * Card-grid presentation for hatch / evolve tasks.
 *
 * Each task is a compact card in a 2-column grid.
 * Tapping a card expands it inline (full row) to reveal details.
 * Only one card is expanded at a time.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Palette,
  Droplets,
  MessageSquare,
  Heart,
  UserPen,
  Activity,
  Loader2,
  HelpCircle,
} from 'lucide-react';
import { openUrl } from '@/lib/downloadFile';

import { Button } from '@/components/ui/button';

import type { HatchTask } from '../hooks/useHatchTasks';
import type { MissionCategory } from './ExpandableMissionCard';
import {
  ExpandableMissionCard,
  MissionDescription,
  MissionProgress,
  MissionAction,
  DynamicHint,
} from './ExpandableMissionCard';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TasksPanelProps {
  tasks: HatchTask[];
  allCompleted: boolean;
  isLoading: boolean;
  onOpenPostModal: () => void;
  onComplete: () => void;
  isCompleting?: boolean;
  completeLabel: string;
  completingLabel: string;
  completeEmoji: string;
  /** Mission category for styling the cards */
  category?: MissionCategory;
}

// ─── Task Icon Mapping ────────────────────────────────────────────────────────

/** Map task ids to lucide icons. Falls back to a generic icon. */
function TaskIcon({ taskId }: { taskId: string }) {
  const iconClass = 'size-5';

  switch (taskId) {
    case 'create_themes':
      return <Palette className={iconClass} />;
    case 'color_moments':
      return <Droplets className={iconClass} />;
    case 'create_posts':
      return <MessageSquare className={iconClass} />;
    case 'interactions':
      return <Heart className={iconClass} />;
    case 'edit_profile':
      return <UserPen className={iconClass} />;
    case 'maintain_stats':
      return <Activity className={iconClass} />;
    default:
      return <HelpCircle className={iconClass} />;
  }
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
  category = 'hatch',
}: TasksPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Card grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {tasks.map((task) => {
          const isDynamic = task.type === 'dynamic';
          const progress =
            task.required > 0 ? task.current / task.required : task.completed ? 1 : 0;

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
                if (task.actionTarget === 'blobbi_post') onOpenPostModal();
                break;
            }
          };

          return (
            <ExpandableMissionCard
              key={task.id}
              id={task.id}
              category={category}
              icon={<TaskIcon taskId={task.id} />}
              title={task.name}
              completed={task.completed}
              progress={Math.min(progress, 1)}
              isExpanded={expandedId === task.id}
              onToggle={handleToggle}
            >
              {/* Expanded content */}
              <MissionDescription>{task.description}</MissionDescription>

              {/* Progress bar for multi-step tasks */}
              {task.required > 1 && !isDynamic && (
                <MissionProgress
                  current={task.current}
                  required={task.required}
                  completed={task.completed}
                />
              )}

              {/* Dynamic stat hint */}
              {isDynamic && !task.completed && (
                <DynamicHint current={task.current} required={task.required} />
              )}

              {/* Action link */}
              {task.action && task.actionLabel && !task.completed && (
                <MissionAction
                  label={task.actionLabel}
                  type={task.action}
                  onClick={handleAction}
                />
              )}
            </ExpandableMissionCard>
          );
        })}
      </div>

      {/* CTA button when all tasks are done */}
      {allCompleted && (
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
      )}
    </div>
  );
}
