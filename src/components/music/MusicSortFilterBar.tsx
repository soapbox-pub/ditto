import { Flame, TrendingUp, Clock, Globe, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export type MusicSort = 'hot' | 'top' | 'new';
export type MusicScope = 'global' | 'following';

interface MusicSortFilterBarProps {
  sort: MusicSort;
  scope: MusicScope;
  onSortChange: (sort: MusicSort) => void;
  onScopeChange: (scope: MusicScope) => void;
  className?: string;
}

const SORT_OPTIONS: { value: MusicSort; label: string; icon: typeof Flame }[] = [
  { value: 'hot', label: 'Hot', icon: Flame },
  { value: 'top', label: 'Top', icon: TrendingUp },
  { value: 'new', label: 'New', icon: Clock },
];

const SCOPE_OPTIONS: { value: MusicScope; label: string; icon: typeof Globe }[] = [
  { value: 'global', label: 'Global', icon: Globe },
  { value: 'following', label: 'Following', icon: Users },
];

/**
 * Shared sort + scope filter bar for Music pages.
 *
 * - **Sort**: Hot (engagement + decay), Top (total engagement), New (chronological)
 * - **Scope**: Global (all artists) or Following (user's follow list)
 *
 * The "Following" option is only shown when the user is logged in.
 */
export function MusicSortFilterBar({
  sort,
  scope,
  onSortChange,
  onScopeChange,
  className,
}: MusicSortFilterBarProps) {
  const { user } = useCurrentUser();

  return (
    <div className={cn('flex items-center gap-2 px-4 py-2', className)}>
      {/* Sort pills */}
      <div className="flex gap-1 p-1 rounded-lg bg-secondary/40">
        {SORT_OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => onSortChange(value)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
              sort === value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Scope pills — only show Following when logged in */}
      <div className="flex gap-1 p-1 rounded-lg bg-secondary/40">
        {SCOPE_OPTIONS.map(({ value, label, icon: Icon }) => {
          if (value === 'following' && !user) return null;
          return (
            <button
              key={value}
              onClick={() => onScopeChange(value)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                scope === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
