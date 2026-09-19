import { type ReactNode, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useIntl } from 'react-intl';
import type { NostrEvent } from '@nostrify/nostrify';

import { ActivityCard } from '@/components/ActivityCard';
import { EmojifiedText } from '@/components/CustomEmoji';
import { FollowUpdateBody } from '@/components/FollowListDiff';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { FOLLOW_UPDATE_VERB, useFollowUpdate } from '@/hooks/useFollowUpdate';
import { useOpenPost } from '@/hooks/useOpenPost';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { getAvatarShape } from '@/lib/avatarShape';
import { encodeEventAddress } from '@/lib/encodeEvent';
import { getDisplayName } from '@/lib/getDisplayName';
import { timeAgo } from '@/lib/timeAgo';

interface FollowUpdateCardProps {
  event: NostrEvent;
  /** Optional action header rendered above the card (e.g. "X reposted"). */
  header?: ReactNode;
  threaded?: boolean;
  threadedLast?: boolean;
  threadedLineClassName?: string;
  className?: string;
  onClick?: React.MouseEventHandler;
  onAuxClick?: React.MouseEventHandler;
}

/**
 * Feed card for a kind 3 follow list, styled as a social activity like the
 * reaction and repost cards rather than a full note: the author's avatar, a
 * one-line "chad started following" actor row, then the people involved with
 * bios and Follow buttons. No nip05 line, no kind header, no action bar.
 */
export function FollowUpdateCard({
  event,
  header,
  threaded,
  threadedLast,
  threadedLineClassName,
  className,
  onClick,
  onAuxClick,
}: FollowUpdateCardProps) {
  const intl = useIntl();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const avatarShape = getAvatarShape(metadata);
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const encodedId = useMemo(() => encodeEventAddress(event), [event]);
  const { onClick: openPost } = useOpenPost(`/${encodedId}`, event);
  const update = useFollowUpdate(event);

  const iconSize = threaded || threadedLast ? 'size-10' : 'size-11';

  const icon = author.isLoading ? (
    <Skeleton className={`${iconSize} rounded-full shrink-0`} />
  ) : (
    <ProfileHoverCard pubkey={event.pubkey} asChild>
      <Link to={profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <Avatar shape={avatarShape} className={iconSize}>
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>
    </ProfileHoverCard>
  );

  // Reads like a note header line: "chad started following · 2h". The name is
  // never truncated, and the timestamp sits inline after the verb (separated by
  // a middot, same as the nip05 · time line on regular notes) as a real
  // permalink to the event.
  const actorRow = (
    <div className="flex flex-wrap items-center gap-x-1.5 text-sm">
      {author.isLoading ? (
        <Skeleton className="h-3.5 w-20" />
      ) : (
        <ProfileHoverCard pubkey={event.pubkey} asChild>
          <Link
            to={profileUrl}
            className="font-bold text-[15px] hover:underline break-words"
            onClick={(e) => e.stopPropagation()}
          >
            {author.data?.event ? (
              <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
            ) : (
              displayName
            )}
          </Link>
        </ProfileHoverCard>
      )}
      {update.mode === 'loading' ? (
        <Skeleton className="h-3.5 w-24" />
      ) : (
        <span className="text-muted-foreground">
          {intl.formatMessage(FOLLOW_UPDATE_VERB[update.mode])}
        </span>
      )}
      <span className="text-muted-foreground">·</span>
      <Link
        to={`/${encodedId}`}
        className="text-muted-foreground hover:underline whitespace-nowrap"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openPost();
        }}
      >
        {timeAgo(event.created_at)}
      </Link>
    </div>
  );

  return (
    <ActivityCard
      header={header}
      icon={icon}
      actorRow={actorRow}
      threaded={threaded}
      threadedLast={threadedLast}
      threadedLineClassName={threadedLineClassName}
      className={className}
      onClick={onClick}
      onAuxClick={onAuxClick}
    >
      <FollowUpdateBody update={update} authorName={displayName} />
    </ActivityCard>
  );
}
