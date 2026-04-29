import { useMemo } from 'react';
import { Users, PartyPopper, UserCheck } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { PeopleAvatarStack } from '@/components/PeopleAvatarStack';
import { useAuthor } from '@/hooks/useAuthor';
import { getDisplayPubkeys, parsePeopleList } from '@/lib/packUtils';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/**
 * Compact feed card for kind 3 (follow list), 30000 (follow set), or 39089 (follow pack).
 * Shows title + optional description + optional cover image + member count + avatar stack.
 *
 * For kind 3 the event has no tags describing it, so we fetch the author's metadata
 * and derive a title like "Alice's follows" with about/banner as description/image.
 */
export function PeopleListContent({ event }: { event: NostrEvent }) {
  const needsAuthorMeta = event.kind === 3;
  const author = useAuthor(needsAuthorMeta ? event.pubkey : '');
  const authorMetadata = needsAuthorMeta ? author.data?.metadata : undefined;

  const { title, description, image, pubkeys, variant } = useMemo(
    () => parsePeopleList(event, {
      authorMetadata,
      authorDisplayName: authorMetadata?.name || authorMetadata?.display_name,
    }),
    [event, authorMetadata],
  );

  const displayPubkeys = useMemo(() => getDisplayPubkeys(event, pubkeys), [event, pubkeys]);

  const safeImage = useMemo(() => sanitizeUrl(image), [image]);

  const TitleIcon = variant === 'follow-list' ? UserCheck : variant === 'follow-set' ? Users : PartyPopper;

  return (
    <div className="mt-2">
      {/* Title */}
      {title && (
        <div className="flex items-center gap-2 mb-2">
          <TitleIcon className="size-4 text-primary shrink-0" />
          <span className="text-[15px] font-semibold leading-snug">{title}</span>
        </div>
      )}

      {/* Description */}
      {description && (
        <p className="text-[15px] leading-relaxed text-foreground/90 line-clamp-3 mb-3">
          {description}
        </p>
      )}

      {/* Cover image */}
      {safeImage && (
        <div className="rounded-2xl overflow-hidden mb-3">
          <img
            src={safeImage}
            alt={title}
            className="w-full max-h-[200px] object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Avatar stack */}
      <PeopleAvatarStack pubkeys={displayPubkeys} maxVisible={8} size="md" />
    </div>
  );
}
