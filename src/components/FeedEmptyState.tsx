import { Link } from 'react-router-dom';
import { Loader2, RefreshCw, Users, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/hooks/useAppContext';
import { getStorageKey } from '@/lib/storageKey';
import { cn } from '@/lib/utils';

interface FeedEmptyStateProps {
  /** Primary empty-state message. */
  message: string;
  /** Called when the user clicks "Switch to Global". Omit to hide the button. */
  onSwitchToGlobal?: () => void;
  /** Show a "Discover people" link to /packs. */
  showDiscover?: boolean;
  /** Called when the user clicks "Try again". Omit to hide the button. */
  onRetry?: () => void;
  /** Whether a retry is currently in progress (disables + spins the button). */
  isRetrying?: boolean;
  /** Whether the device appears to be offline (swaps icon + adds a hint). */
  isOffline?: boolean;
  className?: string;
}

/**
 * Consistent empty state for Follows/Global feed tabs across all feed pages.
 *
 * - Follows tab (no follows): pass `onSwitchToGlobal` and `showDiscover`.
 * - Feed empty despite follows / global miss: pass `onRetry` (and `isRetrying`).
 * - Offline: pass `isOffline` to swap the icon and prepend an offline hint.
 */
export function FeedEmptyState({
  message,
  onSwitchToGlobal,
  showDiscover,
  onRetry,
  isRetrying,
  isOffline,
  className,
}: FeedEmptyStateProps) {
  const { config } = useAppContext();

  // The /packs page defaults to the Follows tab, which is also empty when the
  // user doesn't follow anyone. Pre-seed its saved tab to Global so the link
  // lands on a populated view.
  const handleDiscoverClick = () => {
    try {
      sessionStorage.setItem(getStorageKey(config.appId, 'feed-tab:packs'), 'global');
    } catch { /* sessionStorage unavailable */ }
  };

  const Icon = isOffline ? WifiOff : Users;
  const hasActions = showDiscover || onSwitchToGlobal || onRetry;

  return (
    <div className={cn('py-20 px-8 flex flex-col items-center text-center', className)}>
      <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Icon className="size-6 text-muted-foreground" />
      </div>

      <p className="text-muted-foreground max-w-xs">
        {isOffline && (
          <span className="block font-medium text-foreground mb-1">You appear to be offline.</span>
        )}
        {message}
      </p>

      {hasActions && (
        <div className="flex flex-col gap-2 mt-5 w-full max-w-xs">
          {onRetry && (
            <Button className="rounded-full" onClick={onRetry} disabled={isRetrying}>
              {isRetrying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Try again
            </Button>
          )}
          {showDiscover && (
            <Button asChild className="rounded-full">
              <Link to="/packs" onClick={handleDiscoverClick}>Discover people to follow</Link>
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
