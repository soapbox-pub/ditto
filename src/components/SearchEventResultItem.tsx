import { defineMessage, FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import { AppWindow, Globe, Newspaper, List as ListIcon, UserRoundCheck, Users, SmilePlus } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { EmojifiedText } from '@/components/CustomEmoji';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { useAuthor } from '@/hooks/useAuthor';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import type { SearchEventResult } from '@/hooks/useSearchEvents';
import { getDisplayName } from '@/lib/getDisplayName';
import { getNsiteSubdomain } from '@/lib/nsiteSubdomain';
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
  isFollowed,
  onClick,
}: {
  result: SearchEventResult;
  isSelected: boolean;
  isFollowed: boolean;
  onClick: (result: SearchEventResult) => void;
}) {
  const intl = useIntl();
  const { icon: Icon, label } = EVENT_TYPE_META[result.type];

  // Attribution: "Site · by MK Fain". The type alone doesn't distinguish two
  // sites with the same name, and the author is usually why a result is worth
  // clicking — especially now that followed authors sort to the top.
  const author = useAuthor(result.event.pubkey);
  const authorEvent = author.data?.event;

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
      <div className="relative shrink-0">
        <ResultThumbnail result={result} Icon={Icon} />
        {isFollowed && (
          <span
            className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-primary flex items-center justify-center ring-2 ring-popover"
            title={intl.formatMessage({ id: 'search.following', defaultMessage: 'Following' })}
          >
            <UserRoundCheck className="size-2.5 text-primary-foreground" strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-sm truncate block">{result.title}</span>
        <div className="text-xs text-muted-foreground truncate">
          {authorEvent ? (
            <FormattedMessage
              id="search.eventResult.byline"
              defaultMessage="{type} · by {author}"
              values={{
                type: intl.formatMessage(label),
                author: (
                  <EmojifiedText tags={authorEvent.tags}>
                    {getDisplayName(author.data?.metadata)}
                  </EmojifiedText>
                ),
              }}
            />
          ) : (
            <FormattedMessage {...label} />
          )}
        </div>
      </div>
    </button>
  );
}

/** Picks the thumbnail strategy for a result type. */
function ResultThumbnail({
  result,
  Icon,
}: {
  result: SearchEventResult;
  Icon: ComponentType<{ className?: string }>;
}) {
  if (result.type === 'nsite') {
    return <NsiteThumbnail result={result} Icon={Icon} />;
  }

  // Image comes from untrusted event tags — sanitize before it lands in `src`.
  return (
    <ThumbnailFrame
      image={sanitizeUrl(result.image)}
      fallback={<Icon className="size-4 text-primary" />}
    />
  );
}

/**
 * Thumbnail for an nsite, which almost never carries an image tag.
 *
 * The site is live and served over HTTP, so fall back to the same sources the
 * nsite card and sidebar item already use: the gateway's OpenGraph thumbnail,
 * then the site's favicon, then the generic globe.
 */
function NsiteThumbnail({
  result,
  Icon,
}: {
  result: SearchEventResult;
  Icon: ComponentType<{ className?: string }>;
}) {
  const siteUrl = `https://${getNsiteSubdomain(result.event)}.nsite.lol`;
  const { data: preview } = useLinkPreview(siteUrl);

  const image = sanitizeUrl(result.image) ?? sanitizeUrl(preview?.thumbnail_url);

  return (
    <ThumbnailFrame
      image={image}
      fallback={
        <ExternalFavicon url={siteUrl} size={20} fallback={<Icon className="size-4 text-primary" />} />
      }
    />
  );
}

/** Square thumbnail that swaps to `fallback` when the image is absent or fails. */
function ThumbnailFrame({ image, fallback }: { image?: string; fallback: ReactNode }) {
  return (
    <div className="size-10 rounded-lg overflow-hidden bg-primary/10 flex items-center justify-center">
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
        {fallback}
      </div>
    </div>
  );
}
