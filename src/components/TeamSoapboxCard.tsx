import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Heart } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNostr } from '@nostrify/react';
import { useAuthors } from '@/hooks/useAuthors';
import { useFollowList } from '@/hooks/useFollowActions';
import { FollowAllSplitButton } from '@/components/FollowAllSplitButton';
import { TEAM_SOAPBOX_PACK } from '@/lib/helpContent';

/**
 * A card that displays the "Team Soapbox" follow pack with a help-oriented CTA.
 * Fetches the pack event from relays, shows member avatars, and provides
 * a "Follow All" action. Designed for the Help page but reusable anywhere.
 */
export function TeamSoapboxCard({ className }: { className?: string }) {
  const { nostr } = useNostr();
  const { data: followList } = useFollowList();

  const [event, setEvent] = useState<NostrEvent | null>(null);
  const [loading, setLoading] = useState(true);

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

  const naddrLink = useMemo(() => {
    if (!event) return undefined;
    const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    return `/${nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag })}`;
  }, [event]);

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
                  const name = member?.metadata?.name || member?.metadata?.display_name || 'Anonymous';
                  const shape = getAvatarShape(member?.metadata);
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
            <FollowAllSplitButton
              pubkeys={pubkeys}
              followedPubkeys={followedPubkeys}
              listNoun="Team Soapbox"
              followSuccessTitle="Following Team Soapbox!"
              className="flex-1"
            />

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
