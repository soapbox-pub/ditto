/**
 * MissionSurfaceCard - Compact inline card that surfaces ONE relevant
 * mission/task at a time below the Blobbi visual.
 *
 * Priority:
 *   1. Hatch / Evolve tasks (lifecycle progression)
 *   2. Daily missions (engagement / coin loop)
 *
 * Carousel:
 *   - Auto-rotates every ~5s when > 1 card available
 *   - Manual tap cycles to the next card
 *   - Auto-advances when the current card's mission completes
 *   - Single card = no rotation
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Target,
  ChevronRight,
  Egg,
  Sparkles,
  Coins,
  CircleDot,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

import type { HatchTask } from '@/blobbi/actions/hooks/useHatchTasks';
import type { DailyMission } from '@/blobbi/actions/lib/daily-missions';

// ─── Card Item Types ──────────────────────────────────────────────────────────

interface TaskCardItem {
  kind: 'task';
  badge: 'Hatch' | 'Evolve';
  title: string;
  description: string;
  progress: number; // 0-100
  progressLabel: string;
}

interface DailyCardItem {
  kind: 'daily';
  badge: 'Daily';
  title: string;
  description: string;
  progress: number;
  progressLabel: string;
  reward: number;
  claimed: boolean;
}

type CardItem = TaskCardItem | DailyCardItem;

// ─── Props ────────────────────────────────────────────────────────────────────

interface MissionSurfaceCardProps {
  /** Hatch or evolve tasks (from useActiveTaskProcess) */
  tasks: HatchTask[];
  /** Whether a task process (incubating/evolving) is active */
  isInTaskProcess: boolean;
  /** Process type for badge label */
  processType: 'hatch' | 'evolve' | null;
  /** Daily missions */
  dailyMissions: DailyMission[];
  /** Called when user taps "View all" */
  onViewAll: () => void;
  /** Called when user dismisses the card */
  onHide?: () => void;
  /** Additional className */
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTaskCards(
  tasks: HatchTask[],
  processType: 'hatch' | 'evolve' | null,
): TaskCardItem[] {
  if (!processType) return [];
  const badge = processType === 'hatch' ? 'Hatch' : 'Evolve';

  // Show only incomplete tasks, or the first completed one if all are done
  const incomplete = tasks.filter((t) => !t.completed);
  const toShow = incomplete.length > 0 ? incomplete : tasks.slice(0, 1);

  return toShow.map((t) => ({
    kind: 'task',
    badge: badge as 'Hatch' | 'Evolve',
    title: t.name,
    description: t.description,
    progress: t.required > 0 ? Math.min(100, Math.round((t.current / t.required) * 100)) : 0,
    progressLabel: `${t.current}/${t.required}`,
  }));
}

function buildDailyCards(missions: DailyMission[]): DailyCardItem[] {
  // Show unclaimed missions first, then claimed ones
  const unclaimed = missions.filter((m) => !m.claimed);
  const toShow = unclaimed.length > 0 ? unclaimed : [];

  return toShow.map((m) => ({
    kind: 'daily',
    badge: 'Daily',
    title: m.title,
    description: m.description,
    progress: m.requiredCount > 0
      ? Math.min(100, Math.round((m.currentCount / m.requiredCount) * 100))
      : 0,
    progressLabel: `${m.currentCount}/${m.requiredCount}`,
    reward: m.reward,
    claimed: m.claimed,
  }));
}

// ─── Auto-rotate interval ─────────────────────────────────────────────────────
const ROTATE_INTERVAL_MS = 5000;

// ─── Component ────────────────────────────────────────────────────────────────

export function MissionSurfaceCard({
  tasks,
  isInTaskProcess,
  processType,
  dailyMissions,
  onViewAll,
  onHide,
  className,
}: MissionSurfaceCardProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [isAnimating, setIsAnimating] = useState(false);

  // Build card list: tasks first (priority), then daily
  const cards = useMemo<CardItem[]>(() => {
    const taskCards = isInTaskProcess ? buildTaskCards(tasks, processType) : [];
    const dailyCards = buildDailyCards(dailyMissions);
    return [...taskCards, ...dailyCards];
  }, [tasks, isInTaskProcess, processType, dailyMissions]);

  // Clamp index if cards shrink
  useEffect(() => {
    if (activeIndex >= cards.length && cards.length > 0) {
      setActiveIndex(0);
    }
  }, [cards.length, activeIndex]);

  // Auto-rotate (only when > 1 card)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (cards.length <= 1) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setDirection('right');
      setIsAnimating(true);
      setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % cards.length);
        setIsAnimating(false);
      }, 150);
    }, ROTATE_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cards.length]);

  // Manual cycle
  const handleCycle = useCallback(() => {
    if (cards.length <= 1) return;
    // Reset auto-rotate timer
    if (timerRef.current) clearInterval(timerRef.current);
    setDirection('right');
    setIsAnimating(true);
    setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % cards.length);
      setIsAnimating(false);
      // Restart timer
      timerRef.current = setInterval(() => {
        setDirection('right');
        setIsAnimating(true);
        setTimeout(() => {
          setActiveIndex((prev) => (prev + 1) % cards.length);
          setIsAnimating(false);
        }, 150);
      }, ROTATE_INTERVAL_MS);
    }, 150);
  }, [cards.length]);

  // Nothing to show
  if (cards.length === 0) return null;

  const card = cards[Math.min(activeIndex, cards.length - 1)];

  const badgeColor =
    card.badge === 'Hatch'
      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
      : card.badge === 'Evolve'
        ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
        : 'bg-primary/10 text-primary';

  const badgeIcon =
    card.badge === 'Hatch' ? (
      <Egg className="size-3" />
    ) : card.badge === 'Evolve' ? (
      <Sparkles className="size-3" />
    ) : (
      <Target className="size-3" />
    );

  return (
    <div className={cn('w-full', className)}>
      <button
        onClick={handleCycle}
        className={cn(
          'w-full text-left rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm',
          'px-3.5 py-2.5 transition-all duration-200',
          'hover:bg-accent/40 active:scale-[0.99]',
          isAnimating && direction === 'right' && 'opacity-0 translate-x-2',
          !isAnimating && 'opacity-100 translate-x-0',
        )}
      >
        {/* Top row: badge + title + view all */}
        <div className="flex items-center gap-2 mb-1.5">
          <Badge
            variant="secondary"
            className={cn('text-[10px] font-medium px-1.5 py-0 h-4 gap-1', badgeColor)}
          >
            {badgeIcon}
            {card.badge}
          </Badge>
          <span className="text-sm font-medium truncate flex-1">
            {card.title}
          </span>
          {/* Dot indicators when multiple cards */}
          {cards.length > 1 && (
            <div className="flex gap-0.5 items-center shrink-0">
              {cards.map((_, i) => (
                <CircleDot
                  key={i}
                  className={cn(
                    'size-2 transition-colors',
                    i === activeIndex
                      ? 'text-primary'
                      : 'text-muted-foreground/30',
                  )}
                />
              ))}
            </div>
          )}
          {/* Dismiss button */}
          {onHide && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onHide();
              }}
              className="shrink-0 p-0.5 -m-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              title="Hide mission card"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground mb-2 line-clamp-1">
          {card.description}
        </p>

        {/* Bottom row: progress bar + label + reward/view all */}
        <div className="flex items-center gap-2">
          <Progress
            value={card.progress}
            className="h-1.5 flex-1"
          />
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
            {card.progressLabel}
          </span>
          {card.kind === 'daily' && !card.claimed && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-medium shrink-0">
              <Coins className="size-2.5" />
              {card.reward}
            </span>
          )}
        </div>
      </button>

      {/* View all link */}
      <button
        onClick={onViewAll}
        className="flex items-center gap-1 mx-auto mt-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        View all missions
        <ChevronRight className="size-3" />
      </button>
    </div>
  );
}
