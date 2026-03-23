import { useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Award, Copy, Check, Users, Gift } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { useAuthors } from '@/hooks/useAuthors';
import { useToast } from '@/hooks/useToast';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePendingBadges } from '@/hooks/usePendingBadges';
import { useAcceptBadge } from '@/hooks/useAcceptBadge';
import { genUserName } from '@/lib/genUserName';
import { isShopBadge, isAchievementBadge } from '@/lib/badgeUtils';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { parseBadgeDefinition } from '@/components/BadgeContent';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { AwardBadgeDialog } from '@/components/AwardBadgeDialog';

/**
 * Full detail view for a NIP-58 badge definition (kind 30009).
 * Shows the badge image, name, description, issuer, and list of awardees.
 */
export function BadgeDetailContent({ event }: { event: NostrEvent }) {
  const { nostr } = useNostr();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const acceptBadge = useAcceptBadge();
  const [copied, setCopied] = useState(false);
  const [awardDialogOpen, setAwardDialogOpen] = useState(false);

  const badge = useMemo(() => parseBadgeDefinition(event), [event]);

  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || genUserName(event.pubkey);
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);

  // Query kind 8 badge award events referencing this badge definition
  const badgeATag = badge ? `30009:${event.pubkey}:${badge.identifier}` : '';

  const { pendingBadges } = usePendingBadges(user?.pubkey);
  const pendingForUser = pendingBadges.find((p) => p.aTag === badgeATag);
  const isIssuer = user?.pubkey === event.pubkey;
  const isShop = isShopBadge(event);
  const isAchievement = isAchievementBadge(event);

  const awardsQuery = useQuery({
    queryKey: ['badge-awards', badgeATag],
    queryFn: async () => {
      if (!badgeATag) return [];
      const events = await nostr.query([{
        kinds: [8],
        authors: [event.pubkey],
        '#a': [badgeATag],
        limit: 200,
      }]);
      return events;
    },
    enabled: !!badgeATag,
    staleTime: 2 * 60_000,
  });

  // Extract unique awarded pubkeys from all award events
  const awardedPubkeys = useMemo(() => {
    if (!awardsQuery.data) return [];
    const pkSet = new Set<string>();
    for (const awardEvent of awardsQuery.data) {
      for (const tag of awardEvent.tags) {
        if (tag[0] === 'p' && tag[1]) {
          pkSet.add(tag[1]);
        }
      }
    }
    return [...pkSet];
  }, [awardsQuery.data]);

  // Batch-fetch awardee profiles (first 50)
  const previewPubkeys = useMemo(() => awardedPubkeys.slice(0, 50), [awardedPubkeys]);
  const { data: membersMap, isLoading: membersLoading } = useAuthors(previewPubkeys);

  const handleCopyLink = useCallback(() => {
    const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    const naddr = nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
    navigator.clipboard.writeText(`${window.location.origin}/${naddr}`);
    setCopied(true);
    toast({ title: 'Link copied!' });
    setTimeout(() => setCopied(false), 2000);
  }, [event, toast]);

  if (!badge) return null;

  const heroImage = badge.image
    ?? badge.thumbs.find((t) => t.dimensions === '512x512')?.url
    ?? badge.thumbs[0]?.url;

  return (
    <div>
      {/* Hero badge image */}
      {heroImage ? (
        <div className="w-full overflow-hidden bg-secondary/10 border-b border-border">
          <img
            src={heroImage}
            alt={badge.name}
            className="w-full h-auto max-h-[360px] object-contain bg-secondary/5"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="flex items-center justify-center bg-gradient-to-br from-primary/10 via-primary/5 to-transparent h-[180px] border-b border-border">
          <Award className="size-16 text-primary/20" />
        </div>
      )}

      <div className="px-4 pt-4 pb-3">
        {/* Issuer row */}
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
            <Award className="size-3" />
            Badge
          </Badge>
        </div>

        {/* Badge name */}
        <h2 className="text-xl font-bold mt-4 leading-snug">{badge.name}</h2>

        {/* Description */}
        {badge.description && (
          <p className="text-[15px] text-muted-foreground leading-relaxed mt-2 whitespace-pre-wrap">
            {badge.description}
          </p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          {awardsQuery.isLoading ? (
            <Skeleton className="h-4 w-24" />
          ) : awardedPubkeys.length > 0 ? (
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Users className="size-4" />
              Awarded to {awardedPubkeys.length} user{awardedPubkeys.length !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Users className="size-4" />
              No awards yet
            </span>
          )}
          {isAchievement && (
            <Badge variant="secondary" className="gap-1">
              <Award className="size-3" />
              Achievement
            </Badge>
          )}
          {isShop && (
            <Badge variant="secondary" className="gap-1">
              <Gift className="size-3" />
              Shop Badge
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          {pendingForUser && (
            <Button
              variant="default"
              size="sm"
              disabled={acceptBadge.isPending}
              onClick={() => {
                acceptBadge.mutate(
                  { aTag: badgeATag, awardEventId: pendingForUser.awardEvent.id },
                  { onSuccess: () => toast({ title: 'Badge accepted!' }) },
                );
              }}
            >
              <Check className="size-4 mr-1.5" />
              Accept Badge
            </Button>
          )}
          {isIssuer && (
            <Button variant="outline" size="sm" onClick={() => setAwardDialogOpen(true)}>
              <Gift className="size-4 mr-1.5" />
              Award to…
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={handleCopyLink}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Awardees list */}
      {awardedPubkeys.length > 0 && (
        <div className="border-t border-border">
          <div className="px-4 py-3">
            <h3 className="text-[15px] font-bold">Awarded To</h3>
          </div>

          {membersLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: Math.min(awardedPubkeys.length, 5) }).map((_, i) => (
                <AwardeeCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {previewPubkeys.map((pk) => {
                const member = membersMap?.get(pk);
                return (
                  <AwardeeCard key={pk} pubkey={pk} metadata={member?.metadata} />
                );
              })}
              {awardedPubkeys.length > previewPubkeys.length && (
                <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                  +{awardedPubkeys.length - previewPubkeys.length} more
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <AwardBadgeDialog
        open={awardDialogOpen}
        onOpenChange={setAwardDialogOpen}
        badgeATag={badgeATag}
        badgeName={badge.name}
      />
    </div>
  );
}

/** Individual awardee card. */
function AwardeeCard({ pubkey, metadata }: { pubkey: string; metadata?: NostrMetadata }) {
  const displayName = metadata?.name || metadata?.display_name || genUserName(pubkey);
  const about = metadata?.about;
  const avatarShape = getAvatarShape(metadata);
  const profileUrl = useProfileUrl(pubkey, metadata);

  return (
    <Link
      to={profileUrl}
      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
    >
      <Avatar shape={avatarShape} className="size-11 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-sm">
          {displayName[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <span className="font-bold text-[15px] hover:underline block truncate">
          {displayName}
        </span>
        {about && (
          <p className="text-sm text-muted-foreground line-clamp-1">
            {about}
          </p>
        )}
      </div>
    </Link>
  );
}

function AwardeeCardSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="size-11 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
  );
}
