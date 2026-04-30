import { useMemo } from 'react';
import { nip19 } from 'nostr-tools';
import { Users, PartyPopper, UserCheck } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { EmbeddedCardShell } from '@/components/EmbeddedCardShell';
import { useAuthor } from '@/hooks/useAuthor';
import { useAuthors } from '@/hooks/useAuthors';
import { genUserName } from '@/lib/genUserName';
import { parsePeopleList, getDisplayPubkeys } from '@/lib/packUtils';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/** Max avatars shown in the embedded preview stack. */
const EMBED_AVATAR_LIMIT = 6;

interface EmbeddedPeopleListCardProps {
  event: NostrEvent;
  className?: string;
  disableHoverCards?: boolean;
}

/**
 * Compact embedded card for people-list events — kind 3 (follow list),
 * 30000 (follow set), and 39089 (follow pack).
 *
 * The generic `EmbeddedNoteCard` / `EmbeddedNaddrCard` fallbacks render an
 * empty shell for these kinds because the meaningful data (the list of
 * pubkeys) lives in `p` tags, not in `content` or title tags. This card
 * shows the title, an avatar stack, and a member count — matching the
 * visual language of the full feed card `PeopleListContent`.
 */
export function EmbeddedPeopleListCard({ event, className, disableHoverCards }: EmbeddedPeopleListCardProps) {
  // For kind 3 follow lists we synthesize a title from the author's display name.
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

  const nip19Id = useMemo(() => {
    if (event.kind === 3) {
      return nip19.neventEncode({ id: event.id, author: event.pubkey });
    }
    const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
  }, [event]);

  const previewPubkeys = useMemo(
    () => getDisplayPubkeys(event, pubkeys).slice(0, EMBED_AVATAR_LIMIT),
    [event, pubkeys],
  );
  const { data: membersMap } = useAuthors(previewPubkeys);

  const safeImage = useMemo(() => sanitizeUrl(image), [image]);

  const TitleIcon = variant === 'follow-list' ? UserCheck : variant === 'follow-set' ? Users : PartyPopper;
  const memberLabel = pubkeys.length === 1 ? '1 member' : `${pubkeys.length} members`;

  return (
    <EmbeddedCardShell
      pubkey={event.pubkey}
      createdAt={event.created_at}
      navigateTo={nip19Id}
      className={className}
      disableHoverCards={disableHoverCards}
    >
      {/* Title with variant icon */}
      <div className="flex items-center gap-1.5 min-w-0">
        <TitleIcon className="size-3.5 text-primary shrink-0" />
        <p className="text-sm font-semibold leading-snug line-clamp-1">
          {title}
        </p>
      </div>

      {/* Description */}
      {description && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {description}
        </p>
      )}

      {/* Cover image — only for packs/sets that declare one */}
      {safeImage && (
        <div className="rounded-lg overflow-hidden">
          <img
            src={safeImage}
            alt={title}
            className="w-full max-h-[140px] object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Avatar stack + member count */}
      {pubkeys.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {previewPubkeys.map((pk) => {
              const member = membersMap?.get(pk);
              const name = member?.metadata?.name || member?.metadata?.display_name || genUserName(pk);
              const shape = getAvatarShape(member?.metadata);
              return (
                <Avatar
                  key={pk}
                  shape={shape}
                  className="size-5 ring-1 ring-background"
                >
                  <AvatarImage src={member?.metadata?.picture} alt={name} />
                  <AvatarFallback className="bg-primary/20 text-primary text-[9px]">
                    {name[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              );
            })}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {memberLabel}
          </span>
        </div>
      )}
    </EmbeddedCardShell>
  );
}
