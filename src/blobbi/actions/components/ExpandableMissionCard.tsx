// src/blobbi/actions/components/ExpandableMissionCard.tsx

/**
 * Expandable mission card for the quest-board grid.
 *
 * Collapsed: compact square-ish card showing icon, title, and a tiny
 *            progress ring / checkmark.
 * Expanded:  full-width row that reveals description, progress bar,
 *            action link, claim button, dynamic hints, etc.
 *
 * Only one card is expanded at a time per section (controlled by parent).
 */

import type { ReactNode } from 'react';
import { Check, ChevronRight, ExternalLink, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MissionCategory = 'daily' | 'hatch' | 'evolve';

export interface ExpandableMissionCardProps {
  /** Unique id used to track which card is expanded */
  id: string;
  /** Mission category for visual styling */
  category: MissionCategory;
  /** Icon rendered in the compact card (ReactNode — usually a lucide icon or emoji span) */
  icon: ReactNode;
  /** Short title */
  title: string;
  /** Whether the mission is complete */
  completed: boolean;
  /** Progress fraction 0-1 (used for the tiny ring in compact mode) */
  progress: number;
  /** Whether this card is currently expanded */
  isExpanded: boolean;
  /** Parent calls this to toggle expansion */
  onToggle: (id: string) => void;
  /** Content rendered only when expanded */
  children: ReactNode;
  /** Optional extra className on the outer wrapper */
  className?: string;
}

// ─── Tiny Progress Ring ───────────────────────────────────────────────────────

function ProgressRing({ progress, completed, category }: { progress: number; completed: boolean; category: MissionCategory }) {
  const size = 28;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - progress * circumference;

  if (completed) {
    return (
      <div className="size-7 rounded-full bg-emerald-500/20 flex items-center justify-center">
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      </div>
    );
  }

  const ringColor =
    category === 'hatch'
      ? 'text-sky-500'
      : category === 'evolve'
        ? 'text-violet-500'
        : 'text-amber-500';

  return (
    <svg width={size} height={size} className={cn('shrink-0 -rotate-90', ringColor)}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        opacity={0.15}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-300"
      />
    </svg>
  );
}

// ─── Accent colors per category ───────────────────────────────────────────────

const CATEGORY_STYLES: Record<MissionCategory, { bg: string; expandedBg: string; border: string }> = {
  daily: {
    bg: 'bg-amber-500/[0.06] hover:bg-amber-500/10',
    expandedBg: 'bg-amber-500/[0.06]',
    border: 'ring-amber-500/20',
  },
  hatch: {
    bg: 'bg-sky-500/[0.06] hover:bg-sky-500/10',
    expandedBg: 'bg-sky-500/[0.06]',
    border: 'ring-sky-500/20',
  },
  evolve: {
    bg: 'bg-violet-500/[0.06] hover:bg-violet-500/10',
    expandedBg: 'bg-violet-500/[0.06]',
    border: 'ring-violet-500/20',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ExpandableMissionCard({
  id,
  category,
  icon,
  title,
  completed,
  progress,
  isExpanded,
  onToggle,
  children,
  className,
}: ExpandableMissionCardProps) {
  const styles = CATEGORY_STYLES[category];

  // ── Collapsed card ──
  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => onToggle(id)}
        className={cn(
          'flex flex-col items-center gap-1.5 rounded-xl p-3 transition-all text-center cursor-pointer select-none',
          'ring-1 ring-transparent',
          completed ? 'bg-emerald-500/[0.06] hover:bg-emerald-500/10' : styles.bg,
          className,
        )}
      >
        {/* Icon */}
        <div className="text-lg leading-none">{icon}</div>

        {/* Title — 2 lines max */}
        <span className={cn(
          'text-[11px] font-medium leading-tight line-clamp-2 min-h-[2lh]',
          completed && 'text-emerald-600 dark:text-emerald-400',
        )}>
          {title}
        </span>

        {/* Progress ring / check */}
        <ProgressRing progress={progress} completed={completed} category={category} />
      </button>
    );
  }

  // ── Expanded card (spans full row) ──
  return (
    <div
      className={cn(
        'col-span-full rounded-xl ring-1 transition-all overflow-hidden',
        completed ? 'bg-emerald-500/[0.06] ring-emerald-500/20' : cn(styles.expandedBg, styles.border),
        className,
      )}
    >
      {/* Compact header — click to collapse */}
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex items-center gap-3 p-3 text-left cursor-pointer select-none"
      >
        <div className="text-lg leading-none shrink-0">{icon}</div>
        <span className={cn(
          'text-sm font-medium flex-1 min-w-0',
          completed && 'text-emerald-600 dark:text-emerald-400',
        )}>
          {title}
        </span>
        <ProgressRing progress={progress} completed={completed} category={category} />
      </button>

      {/* Expanded details */}
      <div className="px-3 pb-3 pt-0 space-y-2">
        {children}
      </div>
    </div>
  );
}

// ─── Shared detail sub-components ─────────────────────────────────────────────

/** Description text */
export function MissionDescription({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground leading-snug">{children}</p>;
}

/** Progress bar with fraction label */
export function MissionProgress({ current, required, completed }: { current: number; required: number; completed: boolean }) {
  const pct = required > 0 ? Math.round((current / required) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
        <span className="tabular-nums">{current} / {required}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <Progress value={pct} className={cn('h-1.5', completed && '[&>div]:bg-emerald-500')} />
    </div>
  );
}

/** Inline action link (navigate, external, modal) */
export function MissionAction({
  label,
  type,
  onClick,
}: {
  label: string;
  type: 'navigate' | 'external_link' | 'open_modal';
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      {label}
      {type === 'external_link' ? (
        <ExternalLink className="size-3" />
      ) : (
        <ChevronRight className="size-3" />
      )}
    </button>
  );
}

/** Dynamic / live task hint */
export function DynamicHint({ current, required }: { current: number; required: number }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-amber-600/80 dark:text-amber-400/80">
      <AlertCircle className="size-3 shrink-0" />
      <span>Lowest stat: {current}% (need {required}%+)</span>
    </div>
  );
}
