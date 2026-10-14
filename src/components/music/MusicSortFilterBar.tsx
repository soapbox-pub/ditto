import { Flame, TrendingUp, Clock, Compass, Users } from 'lucide-react';
import { defineMessages, FormattedMessage, type MessageDescriptor } from 'react-intl';
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

const messages = defineMessages({
  hot: { id: 'musicFilter.sort.hot', defaultMessage: 'Hot' },
  top: { id: 'musicFilter.sort.top', defaultMessage: 'Top' },
  new: { id: 'musicFilter.sort.new', defaultMessage: 'New' },
  discover: { id: 'feed.tabs.discover', defaultMessage: 'Discover' },
  following: { id: 'musicFilter.scope.following', defaultMessage: 'Following' },
});

const SORT_OPTIONS: { value: MusicSort; label: MessageDescriptor; icon: typeof Flame }[] = [
  { value: 'hot', label: messages.hot, icon: Flame },
  { value: 'top', label: messages.top, icon: TrendingUp },
  { value: 'new', label: messages.new, icon: Clock },
];

const SCOPE_OPTIONS: { value: MusicScope; label: MessageDescriptor; icon: typeof Compass }[] = [
  { value: 'global', label: messages.discover, icon: Compass },
  { value: 'following', label: messages.following, icon: Users },
];

/**
 * Shared sort + scope filter bar for Music pages.
 *
 * - **Sort**: Hot (engagement + decay), Top (total engagement), New (chronological)
 * - **Scope**: Discover (the viewer's network) or Following (user's follow list)
 *
 * The scope options are only shown when the user is logged in; logged-out
 * visitors always see Discover.
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
            <FormattedMessage {...label} />
          </button>
        ))}
      </div>

      {/* Scope pills — logged in only */}
      {user && (
        <div className="flex gap-1 p-1 rounded-lg bg-secondary/40">
          {SCOPE_OPTIONS.map(({ value, label, icon: Icon }) => (
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
              <FormattedMessage {...label} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
