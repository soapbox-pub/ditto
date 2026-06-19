import { cn } from '@/lib/utils';
import { useNavHidden } from '@/contexts/LayoutContext';

interface NewPostsPillProps {
  /** Number of new posts waiting. The pill is hidden when this is 0. */
  count: number;
  /** Called when the user taps the pill (typically flush/refresh + scroll to top). */
  onClick: () => void;
}

/**
 * Sticky "N new posts" pill shown at the top of a live-updating feed.
 *
 * Sticks below the SubHeaderBar arc and fades out with the nav on scroll.
 * Used by the main feed ({@link Feed}) and the Search page to surface new
 * posts without re-sorting the list under the user's scroll position.
 */
export function NewPostsPill({ count, onClick }: NewPostsPillProps) {
  const navHidden = useNavHidden();

  if (count <= 0) return null;

  return (
    <div
      className={cn(
        'sticky new-posts-pill z-10 flex justify-center pointer-events-none',
        'max-sidebar:transition-opacity max-sidebar:duration-300 max-sidebar:ease-in-out',
        navHidden && 'max-sidebar:opacity-0 max-sidebar:pointer-events-none',
      )}
      style={{ marginBottom: '-3rem' }}
    >
      <button
        onClick={onClick}
        className="pointer-events-auto px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg hover:bg-primary/90 transition-colors animate-in fade-in slide-in-from-top-2 duration-300"
      >
        {count} new post{count !== 1 ? 's' : ''}
      </button>
    </div>
  );
}
