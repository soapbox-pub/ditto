import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FeedEmptyStateProps {
  /** Primary empty-state message. */
  message: string;
  /** Called when the user clicks "Switch to Global". Omit to hide the button. */
  onSwitchToGlobal?: () => void;
  /** Show a "Discover people" link to /packs. */
  showDiscover?: boolean;
  className?: string;
}

/**
 * Consistent empty state for Follows/Global feed tabs across all feed pages.
 *
 * - Follows tab: pass `onSwitchToGlobal` and `showDiscover` to render CTAs.
 * - Global tab: omit both; the message should guide the user
 *   to check their relay connections.
 */
export function FeedEmptyState({
  message,
  onSwitchToGlobal,
  showDiscover,
  className,
}: FeedEmptyStateProps) {
  return (
    <div className={cn('py-20 px-8 flex flex-col items-center text-center', className)}>
      <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Users className="size-6 text-muted-foreground" />
      </div>

      <p className="text-muted-foreground max-w-xs">{message}</p>

      {(showDiscover || onSwitchToGlobal) && (
        <div className="flex flex-col gap-2 mt-5 w-full max-w-xs">
          {showDiscover && (
            <Button asChild className="rounded-full">
              <Link to="/packs">Discover people to follow</Link>
            </Button>
          )}
          {onSwitchToGlobal && (
            <Button variant="ghost" className="rounded-full" onClick={onSwitchToGlobal}>
              Browse the Global feed
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
