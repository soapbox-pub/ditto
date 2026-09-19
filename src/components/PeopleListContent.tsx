import { useMemo } from 'react';
import { Users, PartyPopper, UserCheck } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { PeopleAvatarStack } from '@/components/PeopleAvatarStack';
import { getDisplayPubkeys, parsePeopleList } from '@/lib/packUtils';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/**
 * Compact feed card for kind 30000 (follow set) or 39089 (follow pack):
 * title + optional description + optional cover image + avatar stack.
 *
 * Kind 3 follow lists never reach this component: NoteCard renders them as a
 * `FollowUpdateCard` and the detail page uses `PeopleListDetailContent`.
 */
export function PeopleListContent({ event }: { event: NostrEvent }) {
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
