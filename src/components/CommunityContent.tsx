import { useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Users, Share2, Globe } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuthor } from '@/hooks/useAuthor';
import { useAuthors } from '@/hooks/useAuthors';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useToast } from '@/hooks/useToast';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';

// --- Helpers ---

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function parseCommunityEvent(event: NostrEvent) {
  const name = getTag(event.tags, 'name') || getTag(event.tags, 'd') || 'Unnamed Community';
  const description = getTag(event.tags, 'description') || '';
  const image = getTag(event.tags, 'image');

  // Extract moderators from p tags with "moderator" role
  const moderators = event.tags
    .filter(([n, , , role]) => n === 'p' && role === 'moderator')
    .map(([, pubkey]) => pubkey)
    .filter(Boolean);

  // Extract relays
  const relays = event.tags
    .filter(([n]) => n === 'relay')
    .map(([, url, marker]) => ({ url, marker }))
    .filter((r) => !!r.url);

  return { name, description, image, moderators, relays };
}

// --- Sub-components ---

function ModeratorRow({ pubkey }: { pubkey: string }) {
  const { data } = useAuthor(pubkey);
  const metadata: NostrMetadata | undefined = data?.metadata;
  const name = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  return (
    <Link to={profileUrl} className="flex items-center gap-3 group py-1.5">
      <Avatar className="size-9 ring-2 ring-background">
        <AvatarImage src={metadata?.picture} />
        <AvatarFallback className="bg-muted text-muted-foreground text-xs">
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate group-hover:underline">{name}</p>
        {metadata?.nip05 && (
          <p className="text-xs text-muted-foreground truncate">{metadata.nip05}</p>
        )}
      </div>
      <Badge variant="secondary" className="text-xs shrink-0">Moderator</Badge>
    </Link>
  );
}

// --- Main Component ---

export function CommunityContent({ event }: { event: NostrEvent }) {
  const { toast } = useToast();
  const { name, description, image, moderators, relays } = useMemo(
    () => parseCommunityEvent(event),
    [event],
  );

  // Batch-fetch moderator profiles
  useAuthors(moderators);

  // Owner
  const ownerAuthor = useAuthor(event.pubkey);
  const ownerMetadata = ownerAuthor.data?.metadata;
  const ownerName = ownerMetadata?.display_name || ownerMetadata?.name || genUserName(event.pubkey);
  const ownerProfileUrl = useProfileUrl(event.pubkey, ownerMetadata);

  // Extract website URL from description if present
  const descriptionUrl = useMemo(() => {
    const urlMatch = description.match(/https?:\/\/[^\s]+/);
    return urlMatch?.[0];
  }, [description]);

  // Description text without trailing URL (if the URL is the last thing)
  const descriptionText = useMemo(() => {
    if (!descriptionUrl) return description;
    return description.replace(new RegExp(`\\s*${descriptionUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), '').trim();
  }, [description, descriptionUrl]);

  const handleShare = useCallback(async () => {
    const d = getTag(event.tags, 'd') ?? '';
    const naddr = nip19.naddrEncode({
      kind: event.kind,
      pubkey: event.pubkey,
      identifier: d,
    });
    const url = `${window.location.origin}/${naddr}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied to clipboard' });
    } catch {
      toast({ title: 'Failed to copy link', variant: 'destructive' });
    }
  }, [event, toast]);

  return (
    <div className="mt-3 space-y-5">
      {/* Community hero image */}
      {image ? (
        <div className="relative -mx-4 aspect-[21/9] overflow-hidden">
          <img
            src={image}
            alt={name}
            className="w-full h-full object-cover"
          />
          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          {/* Community name overlaid on image */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
            <h1 className="text-2xl font-bold text-white leading-tight drop-shadow-lg">{name}</h1>
          </div>
        </div>
      ) : (
        <div className="relative -mx-4 aspect-[21/9] bg-gradient-to-br from-primary/15 via-primary/5 to-transparent flex items-center justify-center">
          <Users className="size-16 text-primary/20" />
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
            <h1 className="text-2xl font-bold leading-tight">{name}</h1>
          </div>
        </div>
      )}

      {/* Quick stats + share */}
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="gap-1.5">
          <Users className="size-3.5" />
          {moderators.length} moderator{moderators.length !== 1 ? 's' : ''}
        </Badge>
        {relays.length > 0 && (
          <Badge variant="outline" className="gap-1.5">
            <Globe className="size-3.5" />
            {relays.length} relay{relays.length !== 1 ? 's' : ''}
          </Badge>
        )}
        <Button variant="outline" size="icon" className="ml-auto size-8 shrink-0" onClick={handleShare}>
          <Share2 className="size-3.5" />
        </Button>
      </div>

      {/* Description */}
      {descriptionText && (
        <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{descriptionText}</p>
      )}

      {/* Website link */}
      {descriptionUrl && (
        <a
          href={descriptionUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <Globe className="size-3.5" />
          {descriptionUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
        </a>
      )}

      {/* Owner */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Created by</p>
        <Link to={ownerProfileUrl} className="flex items-center gap-3 group">
          <Avatar className={cn('size-10 ring-2 ring-background')}>
            <AvatarImage src={ownerMetadata?.picture} />
            <AvatarFallback className="bg-muted text-muted-foreground">
              {ownerName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate group-hover:underline">{ownerName}</p>
            {ownerMetadata?.nip05 && (
              <p className="text-xs text-muted-foreground truncate">{ownerMetadata.nip05}</p>
            )}
          </div>
        </Link>
      </div>

      <Separator />

      {/* Moderators */}
      {moderators.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Users className="size-3.5" />
            Moderators
          </h2>
          <div className="space-y-1">
            {moderators.map((pk) => (
              <ModeratorRow key={pk} pubkey={pk} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
