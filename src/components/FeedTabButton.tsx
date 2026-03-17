import { cn } from '@/lib/utils';

interface FeedTabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

/** Shared tab button used across feed pages (Follows / Global / etc.). */
export function FeedTabButton({ label, active, onClick, disabled, className }: FeedTabButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex-1 px-4 py-3.5 text-center text-sm font-medium transition-colors relative hover:bg-secondary/40 min-w-0 truncate',
        active ? 'text-foreground' : 'text-muted-foreground',
        disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
        className,
      )}
    >
      {label}
      {active && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 max-w-16 h-1 bg-primary rounded-full" />
      )}
    </button>
  );
}
