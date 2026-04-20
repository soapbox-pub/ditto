import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  /** Section title text. */
  title: string;
  /** "See all" label text (default: "See all"). */
  seeAllLabel?: string;
  /** Called when "See all" is clicked. Omit to hide the link. */
  onSeeAll?: () => void;
  /** Extra classes on the outer wrapper. */
  className?: string;
}

/**
 * Reusable section header for discovery pages.
 * Displays a title with an optional "See all" action link.
 *
 * Used by music, podcasts, and other content-type discovery tabs.
 */
export function SectionHeader({ title, seeAllLabel = 'See all', onSeeAll, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between px-4 pt-5 pb-2', className)}>
      <h2 className="text-base font-semibold">{title}</h2>
      {onSeeAll && (
        <button
          onClick={onSeeAll}
          className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {seeAllLabel}
          <ChevronRight className="size-3.5" />
        </button>
      )}
    </div>
  );
}
