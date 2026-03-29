import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useQueryClient } from '@tanstack/react-query';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { EmojifiedText } from '@/components/CustomEmoji';
import { BioContent } from '@/components/BioContent';
import { useAuthor } from '@/hooks/useAuthor';
import { useUserStatus } from '@/hooks/useUserStatus';
import { genUserName } from '@/lib/genUserName';
import { formatNip05Display, getNip05Domain } from '@/lib/nip05';
import { useNip05Verify } from '@/hooks/useNip05Verify';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { FollowButton } from '@/components/FollowButton';
import { BadgeThumbnail } from '@/components/BadgeThumbnail';
import { useProfileBadges } from '@/hooks/useProfileBadges';
import { useBadgeDefinitions } from '@/hooks/useBadgeDefinitions';
import { cn } from '@/lib/utils';

interface ProfileHoverCardProps {
  pubkey: string;
  children: React.ReactNode;
  /** If true, the trigger element won't be wrapped in anything extra */
  asChild?: boolean;
}

/**
 * Inner content component — mounts only when the hover card is open.
 * Triggers a background refetch of the author's profile on mount.
 */
function ProfileHoverCardBody({ pubkey }: { pubkey: string }) {
  const queryClient = useQueryClient();
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name ?? genUserName(pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);
  const nip05 = metadata?.nip05;
  const nip05Domain = getNip05Domain(nip05);
  const { data: nip05Verified } = useNip05Verify(nip05, pubkey);
  const nip05Display = nip05Verified && nip05 ? formatNip05Display(nip05) : undefined;
  const { status: userStatus, url: statusUrl } = useUserStatus(pubkey);
  const { refs: badgeRefs } = useProfileBadges(pubkey);
  const firstFive = badgeRefs.slice(0, 5);
  const { badgeMap } = useBadgeDefinitions(firstFive);

  useEffect(() => {
    queryClient.refetchQueries({ queryKey: ['author', pubkey] });
  }, [pubkey, queryClient]);

  return (
    <>
      {/* Mini banner */}
      <div className="h-16 bg-secondary relative">
        {metadata?.banner && (
          <img
            src={metadata.banner}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
        {/* Follow button over the banner */}
        <div className="absolute top-2 right-2">
          <FollowButton pubkey={pubkey} size="sm" />
        </div>
      </div>

      {/* Profile info */}
      <div className="px-4 pb-4">
        {/* Avatar overlapping the banner */}
        <div className="-mt-8 mb-2">
          <Link to={profileUrl} onClick={(e) => e.stopPropagation()}>
            <Avatar shape={avatarShape} className="size-16 border-3 border-background">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-lg">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>

        {/* Name + NIP-05 */}
        <Link
          to={profileUrl}
          className="font-bold text-[15px] hover:underline block truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {author.data?.event ? (
            <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
          ) : displayName}
        </Link>

        {nip05Display && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
            <span className="truncate">@{nip05Display}</span>
            {nip05Domain && (
              <ExternalFavicon url={`https://${nip05Domain}`} size={14} className="shrink-0" />
            )}
          </div>
        )}

        {metadata?.bot && (
          <span className="text-xs text-primary mt-1 inline-block" title="Bot account">Bot</span>
        )}

        {/* Bio */}
        {metadata?.about && (
          <p className={cn(
            'text-sm text-muted-foreground mt-2 whitespace-pre-wrap break-words',
            'line-clamp-3',
          )}>
            <BioContent tags={author.data?.event?.tags}>{metadata.about}</BioContent>
          </p>
        )}

        {/* NIP-38 user status */}
        {userStatus && (
          <p className="text-xs text-muted-foreground italic mt-2 truncate pr-1">
            {statusUrl ? (
              <a href={statusUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" onClick={(e) => e.stopPropagation()}>
                {userStatus}
              </a>
            ) : (
              userStatus
            )}
          </p>
        )}

        {/* Badge preview */}
        {badgeRefs.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2">
            {firstFive.map((ref) => {
              const badge = badgeMap.get(ref.aTag);
              if (!badge) return null;
              return (
                <Link
                  key={ref.aTag}
                  to={`/${nip19.naddrEncode({ kind: 30009, pubkey: ref.pubkey, identifier: ref.identifier })}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <BadgeThumbnail badge={badge} size={28} />
                </Link>
              );
            })}
            {badgeRefs.length > 5 && (
              <span className="text-[10px] text-muted-foreground font-medium">+{badgeRefs.length - 5}</span>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Wraps any element with a hover card that shows a profile preview.
 * Shows avatar, display name, NIP-05, and bio on hover.
 */
export function ProfileHoverCard({ pubkey, children, asChild }: ProfileHoverCardProps) {
  return (
    <HoverCard openDelay={300} closeDelay={150}>
      <HoverCardTrigger asChild={asChild}>
        {children}
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={8}
        className="w-72 p-0 rounded-2xl overflow-hidden border border-border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ProfileHoverCardBody pubkey={pubkey} />
      </HoverCardContent>
    </HoverCard>
  );
}
