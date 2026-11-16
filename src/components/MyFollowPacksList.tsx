import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FormattedMessage, useIntl } from 'react-intl';
import { ChevronRight, Users } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { useFollowPacks, type FollowPack } from '@/hooks/useFollowPacks';
import { getAvatarShape } from '@/lib/avatarShape';
import { profileName } from '@/lib/getDisplayName';
import { tryNaddrEncode } from '@/lib/safeNip19';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/** The current user's own follow packs (kind 39089), each linking to its page for editing. */
export function MyFollowPacksList() {
  const { data: packs, isLoading } = useFollowPacks();

  const sorted = useMemo(
    () => [...(packs ?? [])].sort((a, b) => b.event.created_at - a.event.created_at),
    [packs],
  );

  if (isLoading) {
    return (
      <div className="px-2 py-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="size-12 rounded-xl shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-dashed border-border py-12 px-8 text-center">
          <p className="text-muted-foreground max-w-sm mx-auto">
            <FormattedMessage id="packs.mine.empty" defaultMessage="You haven't made any follow packs yet." />
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-2 py-2">
      {sorted.map((pack) => (
        <PackRow key={pack.id} pack={pack} />
      ))}
    </div>
  );
}

function PackRow({ pack }: { pack: FollowPack }) {
  const naddr = tryNaddrEncode({ kind: 39089, pubkey: pack.event.pubkey, identifier: pack.id });
  const image = sanitizeUrl(pack.event.tags.find(([n]) => n === 'image')?.[1]);
  const description = pack.event.tags.find(([n]) => n === 'description')?.[1] || pack.event.content;
  const previewPubkeys = pack.pubkeys.slice(0, 4);

  if (!naddr) return null;

  return (
    <Link
      to={`/${naddr}`}
      className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-secondary/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {image ? (
        <img src={image} alt="" className="size-12 rounded-xl object-cover shrink-0 border border-border-subtle" />
      ) : (
        <div className="size-12 rounded-xl inset-well flex items-center justify-center shrink-0">
          <Users className="size-5 text-muted-foreground" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <span className="font-medium truncate block">{pack.title}</span>
        {description && (
          <span className="text-sm text-muted-foreground truncate block">{description}</span>
        )}
        <div className="flex items-center gap-2 mt-1">
          {previewPubkeys.length > 0 && (
            <div className="flex -space-x-1.5">
              {previewPubkeys.map((pk) => <MiniAvatar key={pk} pubkey={pk} />)}
            </div>
          )}
          <span className="text-xs text-muted-foreground">
            <FormattedMessage
              id="packs.mine.peopleCount"
              defaultMessage="{count, plural, one {# person} other {# people}}"
              values={{ count: pack.pubkeys.length }}
            />
          </span>
        </div>
      </div>

      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function MiniAvatar({ pubkey }: { pubkey: string }) {
  const intl = useIntl();
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = profileName(metadata) ?? intl.formatMessage({ id: 'common.anonymous', defaultMessage: 'Anonymous' });
  return (
    <Avatar shape={getAvatarShape(metadata)} className="size-5 border-2 border-background shrink-0">
      <AvatarImage src={metadata?.picture} imeta={author.data?.imeta?.picture} alt={displayName} />
      <AvatarFallback className="bg-primary/20 text-primary text-[8px]">
        {displayName[0]?.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
