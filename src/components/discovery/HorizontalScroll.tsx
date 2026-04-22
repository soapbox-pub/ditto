import { cn } from '@/lib/utils';

interface HorizontalScrollProps {
  children: React.ReactNode;
  /** Extra classes on the scroll container. */
  className?: string;
}

/**
 * Shared horizontal scroll container for discovery page sections.
 * Provides a flex row with overflow-x-auto and hidden scrollbar,
 * matching Ditto's existing scroll-snap-free pattern.
 *
 * Used by music track cards, playlist cards, artist cards, and
 * other horizontally-scrolling content sections.
 */
export function HorizontalScroll({ children, className }: HorizontalScrollProps) {
  return (
    <div className={cn('flex gap-3 overflow-x-auto scrollbar-none px-4 pb-1', className)}>
      {children}
    </div>
  );
}
