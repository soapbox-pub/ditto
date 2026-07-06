import type { LucideIcon } from 'lucide-react';
import { UsersRound } from 'lucide-react';

interface CommunityEmptyStateProps {
  icon?: LucideIcon;
  message: string;
  children?: React.ReactNode;
}

/** Feed-style empty state: icon in a muted circle + message, matching FeedEmptyState. */
export function CommunityEmptyState({ icon: Icon = UsersRound, message, children }: CommunityEmptyStateProps) {
  return (
    <div className="py-20 px-8 flex flex-col items-center text-center">
      <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground max-w-xs">{message}</p>
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
