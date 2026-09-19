import { useMemo } from 'react';
import { Users, PartyPopper, UserCheck } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { PeopleAvatarStack } from '@/components/PeopleAvatarStack';
import { FollowListDiff } from '@/components/FollowListDiff';
import { getDisplayPubkeys, parsePeopleList } from '@/lib/packUtils';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/**
 * Feed card for kind 3 (follow list), 30000 (follow set), or 39089 (follow pack).
 *
 * Kind 3 follow lists render as a "life update" poster (who the author started
 * or stopped following since the previous version) via `FollowListDiff`.
 * Curated sets and packs keep the generic title + description + cover image +
 * avatar stack treatment.
 */
export function PeopleListContent({ event }: { event: NostrEvent }) {
  if (event.kind === 3) {
    return <FollowListDiff event={event} />;
  }

  return <PeopleListCard event={event} />;
}

function PeopleListCard({ event }: { event: NostrEvent }) {
  const { title, description, image, pubkeys, variant } = useMemo(
    () => parsePeopleList(event),
    [event],
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
            decoding="async"
          />
        </div>
      )}

      {/* Avatar stack */}
      <PeopleAvatarStack pubkeys={displayPubkeys} maxVisible={8} size="md" />
    </div>
  );
}
