import { MissionCelebrationSparkle } from '@/components/MissionCelebrationSparkle';
import { Progress } from '@/components/ui/progress';
import { missionProgressValue } from '@/lib/postOnboardingGuide';
import { cn } from '@/lib/utils';

/**
 * The mission's progress presentation, shared by every surface that shows it.
 *
 * Presentation only: it is handed a count and a celebration flag and renders
 * them. It reads no mission state and owns no policy, so a surface can place it
 * anywhere without inheriting a subscription — and so the upcoming `/missions`
 * redesign changes the count treatment in one file rather than three.
 *
 * Reduced motion is handled entirely in CSS (`.mission-count-pop`,
 * `.mission-progress-glow`, `.mission-sparkle` are all disabled under
 * `prefers-reduced-motion`), so nothing here needs to branch on it: the count
 * and the fill still convey everything the animation was decorating.
 */

/**
 * The `2/4` count, its completion pop, and the spark burst that punctuates it.
 *
 * The sparkle is absolutely positioned, so the wrapper owns the `relative` that
 * anchors it — which is exactly the detail each surface used to re-derive.
 */
export function MissionProgressCount({
  completedCount,
  totalCount,
  celebrating = false,
  className,
  countClassName,
  celebratingCountClassName,
  ariaLabel,
}: {
  completedCount: number;
  totalCount: number;
  /** Play the completion pop and the spark burst. */
  celebrating?: boolean;
  /** Positioning for the anchor. */
  className?: string;
  /** The count's own typography and chrome at rest. */
  countClassName?: string;
  /**
   * Replaces `countClassName` while celebrating. The mobile teaser shows a bare
   * number at rest and a pill during the celebration; the other surfaces keep
   * the pill throughout and leave this unset.
   */
  celebratingCountClassName?: string;
  ariaLabel?: string;
}) {
  const resting = celebrating && celebratingCountClassName
    ? celebratingCountClassName
    : countClassName;

  return (
    <div className={cn('relative shrink-0', className)}>
      <span className={cn(resting, celebrating && 'mission-count-pop')} aria-label={ariaLabel}>
        {completedCount}/{totalCount}
      </span>
      <MissionCelebrationSparkle active={celebrating} />
    </div>
  );
}

/**
 * The progress bar, for the surfaces that use the standard track.
 *
 * The mobile teaser deliberately keeps its own hairline bar: it is a
 * width-transitioned strip with explicit `progressbar` semantics, which is a
 * different presentation rather than a differently-sized version of this one.
 * Forcing both through one component would have meant changing how one of them
 * animates, and the completion fill is the one moment this must not alter.
 */
export function MissionProgressBar({
  completedCount,
  totalCount,
  celebrating = false,
  className,
  'aria-label': ariaLabel,
  'aria-hidden': ariaHidden,
}: {
  completedCount: number;
  totalCount: number;
  celebrating?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-hidden'?: boolean;
}) {
  return (
    <Progress
      value={missionProgressValue(completedCount, totalCount)}
      className={cn(className, celebrating && 'mission-progress-glow')}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden}
    />
  );
}
