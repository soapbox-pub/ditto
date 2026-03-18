import { cn } from '@/lib/utils';

interface FeedEmptyStateProps {
  /** Primary empty-state message. */
  message: string;
  /** Called when the user clicks "Switch to Global". Omit to hide the button. */
  onSwitchToGlobal?: () => void;
  className?: string;
}

/**
 * Consistent empty state for Follows/Global feed tabs across all feed pages.
 *
 * - Follows tab: pass `onSwitchToGlobal` to render a "Switch to Global" CTA.
 * - Global tab: omit `onSwitchToGlobal`; the message should guide the user
 *   to check their relay connections.
 */
export function FeedEmptyState({
  message,
  onSwitchToGlobal,
  className,
}: FeedEmptyStateProps) {
  return (
    <div className={cn('py-16 px-8 text-center space-y-3', className)}>
      <p className="text-muted-foreground break-all">{message}</p>
      {onSwitchToGlobal && (
        <button
          className="text-sm text-primary hover:underline"
          onClick={onSwitchToGlobal}
        >
          Switch to Global
        </button>
      )}
    </div>
  );
}
