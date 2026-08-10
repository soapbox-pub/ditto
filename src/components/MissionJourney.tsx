import type { ReactNode } from 'react';

import { MissionProgressBar, MissionProgressCount } from '@/components/MissionProgress';
import { cn } from '@/lib/utils';

/**
 * One journey, presented as an entity in its own right.
 *
 * `/missions` is plural on purpose, and this is the shape that makes that true
 * without inventing anything: a journey has a mark, a name, a description, a
 * status, its own progress, its missions and (optionally) its reward. Today
 * exactly one of these is rendered. A second one later is another instance,
 * not a rewrite of the page.
 *
 * Deliberately **not** a mission platform. There is no registry, no config
 * schema and no persistence here; it is a presentational container that takes
 * everything it shows as props. Building further ahead than that would be
 * designing for journeys nobody has specified.
 *
 * Progress uses the shared primitives, so this cannot drift from the sidebar
 * widget's count or the celebration behaviour.
 */
export function MissionJourney({
  eyebrow,
  title,
  description,
  mark,
  status,
  completedCount,
  totalCount,
  showProgress = true,
  celebrating = false,
  missions,
  reward,
  footer,
}: {
  /** The journey's own name, as a quiet label above the title. */
  eyebrow: string;
  /** What this journey is, in the user's terms. */
  title: string;
  description: string;
  /** The journey's identity art. Never the reward's. */
  mark: ReactNode;
  /**
   * Short state word: "Not started", "Complete", "Hidden". Omitted for a
   * journey that is simply underway, where the count and bar already say it.
   */
  status?: string;
  completedCount: number;
  totalCount: number;
  /**
   * Whether the count and bar belong on screen. On by default: a finished
   * journey's `4/4` is the achievement, not clutter. The compact surfaces trade
   * it for the reward framing because they have no room for both; a page does.
   */
  showProgress?: boolean;
  celebrating?: boolean;
  /** The journey's missions. */
  missions: ReactNode;
  /** The journey's reward, when it has one. */
  reward?: ReactNode;
  /** Anything that belongs under both columns (development controls, notes). */
  footer?: ReactNode;
}) {
  return (
    <section aria-label={eyebrow} className="space-y-5">
      {/* Hero. Calm rather than promotional: this is a place the user returns
          to, not a landing page they need persuading by. */}
      <div
        className={cn(
          'rounded-2xl border border-border/70 bg-card/60 p-5 sm:p-6',
          celebrating && 'mission-celebrate',
        )}
      >
        <div className="flex items-start gap-4">
          {mark}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                {eyebrow}
              </p>
              {status && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {status}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold leading-tight text-foreground sm:text-2xl">
              {title}
            </h2>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
          {showProgress && (
            <MissionProgressCount
              completedCount={completedCount}
              totalCount={totalCount}
              celebrating={celebrating}
              countClassName="block rounded-full bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary tabular-nums"
              ariaLabel={`${completedCount} of ${totalCount} missions complete`}
            />
          )}
        </div>

        {showProgress && (
          <MissionProgressBar
            completedCount={completedCount}
            totalCount={totalCount}
            celebrating={celebrating}
            className="mt-5 h-1.5"
            aria-label={`${title}: ${completedCount} of ${totalCount} missions complete`}
          />
        )}
      </div>

      {/* Missions get the width; the reward sits beside them on desktop and
          below them on anything narrower, with no separate mobile branch. */}
      <div
        className={cn(
          'grid gap-5',
          reward && 'lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start',
        )}
      >
        <div className="min-w-0">{missions}</div>
        {reward && <div className="min-w-0">{reward}</div>}
      </div>

      {footer}
    </section>
  );
}
