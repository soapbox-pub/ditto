import { useMemo, useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, UserPlus, Check, Loader2, Heart } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNostr } from '@nostrify/react';
import { useAuthors } from '@/hooks/useAuthors';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { genUserName } from '@/lib/genUserName';
import { TEAM_SOAPBOX_PACK } from '@/lib/helpContent';

/**
 * A card that displays the "Team Soapbox" follow pack with a help-oriented CTA.
 * Fetches the pack event from relays, shows member avatars, and provides
 * a "Follow All" action. Designed for the Help page but reusable anywhere.
 */
export function TeamSoapboxCard({ className }: { className?: string }) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followList } = useFollowList();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();

  const [event, setEvent] = useState<NostrEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowingAll, setIsFollowingAll] = useState(false);

  // Fetch the pack event
  useEffect(() => {
    let cancelled = false;

    const fetchPack = async () => {
      try {
        const events = await nostr.query(
          [{
            kinds: [TEAM_SOAPBOX_PACK.kind],
            authors: [TEAM_SOAPBOX_PACK.pubkey],
            '#d': [TEAM_SOAPBOX_PACK.identifier],
            limit: 1,
          }],
          { signal: AbortSignal.timeout(8000) },
        );
        if (!cancelled && events.length > 0) {
          setEvent(events[0]);
        }
      } catch (error) {
        console.warn('Failed to fetch Team Soapbox pack:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPack();
    return () => { cancelled = true; };
  }, [nostr]);

  const pubkeys = useMemo(
    () => event?.tags.filter(([n]) => n === 'p').map(([, pk]) => pk) ?? [],
    [event],
  );

  const previewPubkeys = useMemo(() => pubkeys.slice(0, 8), [pubkeys]);
  const { data: membersMap } = useAuthors(previewPubkeys);

  const followedPubkeys = useMemo(() => new Set(followList?.pubkeys ?? []), [followList]);
  const newPubkeys = useMemo(
    () => pubkeys.filter((pk) => !followedPubkeys.has(pk)),
    [pubkeys, followedPubkeys],
  );

  const naddrLink = useMemo(() => {
    if (!event) return undefined;
    const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    return `/${nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag })}`;
  }, [event]);

  const handleFollowAll = useCallback(async () => {
    if (!user || !event) return;

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
        title: 'Following Team Soapbox!',
        description: added.length > 0
          ? `Added ${added.length} new account${added.length !== 1 ? 's' : ''} to your follow list.`
          : 'You were already following everyone on the team.',
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
  }, [user, event, pubkeys, nostr, publishEvent, toast]);

  if (loading) {
    return <TeamSoapboxCardSkeleton className={className} />;
  }

  if (!event) return null;

  return (
    <div className={className}>
      <div className="rounded-2xl border border-primary/20 bg-primary/5 overflow-hidden">
        <div className="px-5 pt-5 pb-4 space-y-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center size-10 shrink-0 rounded-full bg-primary/15">
              <Heart className="size-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold leading-snug">Need help? Meet Team Soapbox</h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                These are real people who built this platform and are happy to help. Follow them and don't be shy — ask anything!
              </p>
            </div>
          </div>

          {/* Avatar stack + member count */}
          {pubkeys.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {previewPubkeys.map((pk) => {
                  const member = membersMap?.get(pk);
                  const name = member?.metadata?.name || genUserName(pk);
                  const shape = getAvatarShape(member?.metadata as Record<string, unknown>);
                  return (
                    <Avatar key={pk} shape={shape} className="size-8 ring-2 ring-background">
                      <AvatarImage src={member?.metadata?.picture} alt={name} />
                      <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                        {name[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  );
                })}
              </div>
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Users className="size-3.5" />
                {pubkeys.length} member{pubkeys.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              className="gap-2 flex-1"
              onClick={handleFollowAll}
              disabled={isFollowingAll || !user}
            >
              {isFollowingAll ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Following...
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

            {naddrLink && (
              <Button variant="outline" asChild>
                <Link to={naddrLink}>View Pack</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamSoapboxCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="rounded-2xl border border-primary/20 bg-primary/5 overflow-hidden">
        <div className="px-5 pt-5 pb-4 space-y-4">
          <div className="flex items-start gap-3">
            <Skeleton className="size-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="size-8 rounded-full ring-2 ring-background" />
              ))}
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1 rounded-md" />
            <Skeleton className="h-10 w-24 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
