import { defineMessage, FormattedMessage, type MessageDescriptor } from 'react-intl';
import { AppWindow, Globe, Newspaper, List as ListIcon, Users, SmilePlus } from 'lucide-react';
import type { ComponentType } from 'react';
import type { SearchEventResult } from '@/hooks/useSearchEvents';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

interface EventTypeMeta {
  icon: ComponentType<{ className?: string }>;
  label: MessageDescriptor;
}

/** Icon and label shown beneath the title of each Nostr event search result. */
const EVENT_TYPE_META: Record<SearchEventResult['type'], EventTypeMeta> = {
  'article': {
    icon: Newspaper,
    label: defineMessage({ id: 'search.eventType.article', defaultMessage: 'Article' }),
  },
  'list': {
    icon: ListIcon,
    label: defineMessage({ id: 'search.eventType.list', defaultMessage: 'List' }),
  },
  'follow-pack': {
    icon: Users,
    label: defineMessage({ id: 'search.eventType.followPack', defaultMessage: 'Follow pack' }),
  },
  'emoji-pack': {
    icon: SmilePlus,
    label: defineMessage({ id: 'search.eventType.emojiPack', defaultMessage: 'Emoji pack' }),
  },
  'nsite': {
    icon: Globe,
    label: defineMessage({ id: 'search.eventType.nsite', defaultMessage: 'Site' }),
  },
  'app': {
    icon: AppWindow,
    label: defineMessage({ id: 'search.eventType.app', defaultMessage: 'App' }),
  },
};

/**
 * A single Nostr event result row in the search dropdown / mobile search sheet.
 *
 * Shared by {@link ProfileSearchDropdown} and {@link MobileSearchSheet} so both
 * surfaces stay in sync as new result types are added.
 */
export function SearchEventResultItem({
  result,
  isSelected,
  onClick,
}: {
  result: SearchEventResult;
  isSelected: boolean;
  onClick: (result: SearchEventResult) => void;
}) {
  const { icon: Icon, label } = EVENT_TYPE_META[result.type];
  // Image comes from untrusted event tags — sanitize before it lands in `src`.
  const image = sanitizeUrl(result.image);

  return (
    <button
      data-search-item
      role="option"
      aria-selected={isSelected}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onClick(result)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="size-10 shrink-0 rounded-lg overflow-hidden bg-primary/10 flex items-center justify-center">
        {image ? (
          <img
            src={image}
            alt=""
            className="size-10 object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
            }}
            decoding="async"
          />
        ) : null}
        <div className={cn('items-center justify-center size-10', image ? 'hidden' : 'flex')}>
          <Icon className="size-4 text-primary" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-sm truncate block">{result.title}</span>
        <div className="text-xs text-muted-foreground truncate">
          <FormattedMessage {...label} />
        </div>
      </div>
    </button>
  );
}
