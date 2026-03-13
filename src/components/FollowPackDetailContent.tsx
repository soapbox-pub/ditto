import { useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, UserPlus, Check, Loader2, Copy } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/useToast';
import { useAuthor } from '@/hooks/useAuthor';
import { useAuthors } from '@/hooks/useAuthors';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList, useFollowActions } from '@/hooks/useFollowActions';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useNostr } from '@nostrify/react';
import { genUserName } from '@/lib/genUserName';
import { VerifiedNip05Text } from '@/components/Nip05Badge';

/** Parse a follow pack / starter pack event into structured data. */
function parsePackEvent(event: NostrEvent) {
  const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1];
  const title = getTag('title') || getTag('name') || 'Untitled Pack';
  const description = getTag('description') || getTag('summary') || '';
  const image = getTag('image') || getTag('thumb') || getTag('banner');
  const pubkeys = event.tags.filter(([n]) => n === 'p').map(([, pk]) => pk);

  return { title, description, image, pubkeys };
}

/**
 * Full detail view for a follow pack / starter pack event.
 * Shows the member list with individual follow buttons, Follow All, etc.
 */
export function FollowPackDetailContent({ event }: { event: NostrEvent }) {
  const { toast } = useToast();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followList } = useFollowList();
  const { mutateAsync: publishEvent } = useNostrPublish();

  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata as Record<string, unknown>);
  const displayName = metadata?.name || genUserName(event.pubkey);
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);

  const { title, description, image, pubkeys } = useMemo(() => parsePackEvent(event), [event]);

  // Batch-fetch all member profiles
  const { data: membersMap, isLoading: membersLoading } = useAuthors(pubkeys);

  // Follow state
  const followedPubkeys = useMemo(() => new Set(followList?.pubkeys ?? []), [followList]);
  const newPubkeys = useMemo(
    () => pubkeys.filter((pk) => !followedPubkeys.has(pk)),
    [pubkeys, followedPubkeys],
  );

  const [isFollowingAll, setIsFollowingAll] = useState(false);
  const [copied, setCopied] = useState(false);

  const isStarterPack = event.kind === 39089;

  const handleFollowAll = useCallback(async () => {
    if (!user) {
      toast({ title: 'Not logged in', description: 'Please log in to follow users.', variant: 'destructive' });
      return;
    }

    setIsFollowingAll(true);
    try {
      const signal = AbortSignal.timeout(10_000);

      const followEvents = await nostr.query(
        [{ kinds: [3], authors: [user.pubkey], limit: 1 }],
        { signal },
      );

      const latestEvent = followEvents.length > 0
        ? followEvents.reduce((latest, current) => current.created_at > latest.created_at ? current : latest)
        : null;

      const existingFollows = latestEvent
        ? latestEvent.tags.filter(([name]) => name === 'p').map(([, pk]) => pk)
        : [];

      const allFollows = [...new Set([...existingFollows, ...pubkeys])];
      const added = pubkeys.filter((pk) => !existingFollows.includes(pk));

      await publishEvent({
        kind: 3,
        content: latestEvent?.content ?? '',
        tags: allFollows.map((pk) => ['p', pk]),
      });

      toast({
        title: 'Following all!',
        description: added.length > 0
          ? `Added ${added.length} new account${added.length !== 1 ? 's' : ''} to your follow list.`
          : 'You were already following everyone in this pack.',
      });
    } catch (error) {
      console.error('Failed to follow all:', error);
      toast({
        title: 'Failed to follow',
        description: 'There was an error updating your follow list.',
        variant: 'destructive',
      });
    } finally {
      setIsFollowingAll(false);
    }
  }, [user, pubkeys, nostr, publishEvent, toast]);

  const handleCopyLink = useCallback(() => {
    const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    const naddr = nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
    navigator.clipboard.writeText(`${window.location.origin}/${naddr}`);
    setCopied(true);
    toast({ title: 'Link copied!' });
    setTimeout(() => setCopied(false), 2000);
  }, [event, toast]);

  return (
    <div>
      {/* Hero image */}
      {image && (
        <div className="w-full overflow-hidden bg-muted border-b border-border">
          <img
            src={image}
            alt={title}
            className="w-full h-auto max-h-[300px] object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      <div className="px-4 pt-4 pb-3">
        {/* Author row */}
        <div className="flex items-center gap-3">
          <Link to={`/${npub}`}>
            <Avatar shape={avatarShape} className="size-11">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-sm">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>

          <div className="flex-1 min-w-0">
            <Link to={`/${npub}`} className="font-bold text-[15px] hover:underline block truncate">
              {displayName}
            </Link>
            {metadata?.nip05 && (
              <VerifiedNip05Text nip05={metadata.nip05} pubkey={event.pubkey} className="text-sm text-muted-foreground truncate block" />
            )}
          </div>

          <Badge variant="secondary" className="shrink-0 gap-1">
            <Users className="size-3" />
            {isStarterPack ? 'Starter Pack' : 'Follow Set'}
          </Badge>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold mt-4 leading-snug">{title}</h2>

        {/* Description */}
        {description && (
          <p className="text-[15px] text-muted-foreground leading-relaxed mt-2 whitespace-pre-wrap">
            {description}
          </p>
        )}

        {/* Stats + Actions */}
        <div className="flex items-center gap-3 mt-4">
          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Users className="size-4" />
            {pubkeys.length} member{pubkeys.length !== 1 ? 's' : ''}
          </span>
          {newPubkeys.length > 0 && user && (
            <span className="text-sm text-green-600 dark:text-green-400">
              {newPubkeys.length} new for you
            </span>
          )}
        </div>

        <div className="flex gap-2 mt-3">
          <Button
            className="gap-2 flex-1"
            onClick={handleFollowAll}
            disabled={isFollowingAll || !user}
          >
            {isFollowingAll ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Following…
              </>
            ) : newPubkeys.length === 0 && user ? (
              <>
                <Check className="size-4" />
                Already following all
              </>
            ) : (
              <>
                <UserPlus className="size-4" />
                Follow All ({pubkeys.length})
              </>
            )}
          </Button>

          <Button variant="outline" size="icon" onClick={handleCopyLink}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Members list */}
      <div className="border-t border-border">
        <div className="px-4 py-3">
          <h3 className="text-[15px] font-bold">Members</h3>
        </div>

        {membersLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: Math.min(pubkeys.length, 8) }).map((_, i) => (
              <MemberCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {pubkeys.map((pk) => {
              const member = membersMap?.get(pk);
              const isFollowed = followedPubkeys.has(pk);
              return (
                <MemberCard
                  key={pk}
                  pubkey={pk}
                  metadata={member?.metadata}
                  isFollowed={isFollowed}
                  isSelf={pk === user?.pubkey}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Individual member card in the follow pack. */
function MemberCard({
  pubkey,
  metadata,
  isFollowed,
  isSelf,
}: {
  pubkey: string;
  metadata?: NostrMetadata;
  isFollowed: boolean;
  isSelf: boolean;
}) {
  const navigate = useNavigate();
  const npub = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);
  const displayName = metadata?.name || metadata?.display_name || genUserName(pubkey);
  const about = metadata?.about;
  const avatarShape = getAvatarShape(metadata as Record<string, unknown>);
  const { follow, unfollow, isPending } = useFollowActions();

  const handleFollowToggle = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isFollowed) {
        await unfollow(pubkey);
      } else {
        await follow(pubkey);
      }
    },
    [isFollowed, pubkey, follow, unfollow],
  );

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors cursor-pointer"
      onClick={() => navigate(`/${npub}`)}
    >
      <Link to={`/${npub}`} className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <Avatar shape={avatarShape} className="size-11">
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        <Link
          to={`/${npub}`}
          className="font-bold text-[15px] hover:underline block truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {displayName}
        </Link>
        {about && (
          <p className="text-sm text-muted-foreground line-clamp-1">
            {about}
          </p>
        )}
      </div>

      {!isSelf && (
        <Button
          variant={isFollowed ? 'outline' : 'default'}
          size="sm"
          className="shrink-0"
          onClick={handleFollowToggle}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : isFollowed ? (
            'Following'
          ) : (
            'Follow'
          )}
        </Button>
      )}
    </div>
  );
}

function MemberCardSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="size-11 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-8 w-20 rounded-md" />
    </div>
  );
}
