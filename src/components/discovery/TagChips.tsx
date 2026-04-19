import { cn } from '@/lib/utils';

interface TagChipsProps {
  /** Available tags/genres to display as chips. */
  tags: string[];
  /** Currently selected tag (null/undefined = "All"). */
  selected?: string | null;
  /** Called when a tag chip is clicked. Called with `null` for the "All" chip. */
  onSelect: (tag: string | null) => void;
  /** Label for the "show all" chip (default: "All"). */
  allLabel?: string;
  /** Extra classes on the outer scroll container. */
  className?: string;
}

/**
 * Horizontal scrollable row of tag/genre pill buttons with an "All" default.
 *
 * Used by music genre filtering, podcast categories, and other
 * tag-based discovery filters.
 */
export function TagChips({ tags, selected, onSelect, allLabel = 'All', className }: TagChipsProps) {
  const isAllActive = !selected;

  return (
    <div className={cn('flex gap-2 overflow-x-auto scrollbar-none px-4 py-3', className)}>
      <button
        onClick={() => onSelect(null)}
        className={cn(
          'shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors duration-200',
          isAllActive
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary/50 text-muted-foreground hover:bg-secondary',
        )}
      >
        {allLabel}
      </button>
      {tags.map((tag) => {
        const isActive = selected === tag;
        return (
          <button
            key={tag}
            onClick={() => onSelect(isActive ? null : tag)}
            className={cn(
              'shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors duration-200 capitalize',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary/50 text-muted-foreground hover:bg-secondary',
            )}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}
