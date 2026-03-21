import { cn } from '@/lib/utils';
import type { BadgeTier } from '@/lib/badgeUtils';

const TIER_STYLES: Record<BadgeTier, { bg: string; text: string; label: string }> = {
  bronze: { bg: 'bg-orange-100 dark:bg-orange-950/50', text: 'text-orange-700 dark:text-orange-400', label: 'Bronze' },
  silver: { bg: 'bg-slate-100 dark:bg-slate-800/50', text: 'text-slate-600 dark:text-slate-300', label: 'Silver' },
  gold: { bg: 'bg-yellow-100 dark:bg-yellow-950/50', text: 'text-yellow-700 dark:text-yellow-400', label: 'Gold' },
  diamond: { bg: 'bg-cyan-100 dark:bg-cyan-950/50', text: 'text-cyan-700 dark:text-cyan-400', label: 'Diamond' },
};

interface BadgeTierPillProps {
  tier: BadgeTier;
  className?: string;
}

/** Small pill showing a tier label (Bronze/Silver/Gold/Diamond) with appropriate color. */
export function BadgeTierPill({ tier, className }: BadgeTierPillProps) {
  const style = TIER_STYLES[tier];
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide',
        style.bg,
        style.text,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
