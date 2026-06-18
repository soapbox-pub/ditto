import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { FileText } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { EmojifiedText } from '@/components/CustomEmoji';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { ExternalSourceLink } from '@/components/ExternalSourceLink';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { getAvatarShape } from '@/lib/avatarShape';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

/** Extract title / summary / cover image from a long-form article event. */
function extractArticleMeta(event: NostrEvent): {
  title?: string;
  summary?: string;
  image?: string;
} {
  const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1];
  return {
    title: getTag('title'),
    summary: getTag('summary'),
    image: sanitizeUrl(getTag('image')),
  };
}

interface EmbeddedArticleCardProps {
  event: NostrEvent;
  className?: string;
  /** When true, the author ProfileHoverCard is disabled (avoids nesting). */
  disableHoverCards?: boolean;
  /** Original URL the article was linked from. When it points to a non-Ditto
   *  host, the card shows the source's favicon + hostname as an open link. */
  sourceUrl?: string;
}

/**
 * Long-form article (NIP-23) preview card. Laid out like a rich link preview:
 * a cover image on top, the title + summary below, and a small author byline
 * at the bottom. Used for both naddr embeds and nevent quotes of kind 30023.
 */
export function EmbeddedArticleCard({ event, className, disableHoverCards, sourceUrl }: EmbeddedArticleCardProps) {
  const navigate = useNavigate();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || metadata?.display_name || 'Anonymous';
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const avatarShape = getAvatarShape(metadata);

  const { title, summary, image } = useMemo(() => extractArticleMeta(event), [event]);

  const naddrId = useMemo(() => {
    const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
  }, [event]);

  return (
    <div
      className={cn(
        'group block rounded-2xl border border-border overflow-hidden',
        'hover:bg-secondary/40 transition-colors cursor-pointer',
        className,
      )}
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/${naddrId}`);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          navigate(`/${naddrId}`);
        }
      }}
    >
      {/* Cover image */}
      {image && (
        <div className="w-full overflow-hidden bg-muted">
          <img
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-[180px] object-cover"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      <div className="px-3.5 py-2.5 space-y-1">
        {/* Article label + external-source link */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="size-3.5 shrink-0" />
          <span>Article</span>
          <ExternalSourceLink url={sourceUrl} className="ml-auto" />
        </div>

        {/* Title */}
        {title && (
          <p className="text-base font-semibold leading-snug line-clamp-2">
            {title}
          </p>
        )}

        {/* Summary */}
        {summary && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {summary}
          </p>
        )}

        {/* Author byline */}
        <MaybeProfileHoverCard pubkey={event.pubkey} disabled={disableHoverCards}>
          <Link
            to={profileUrl}
            className="flex items-center gap-1.5 pt-0.5 min-w-0 w-fit hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <Avatar shape={avatarShape} className="size-5 shrink-0">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-medium text-muted-foreground truncate">
              {author.data?.event ? (
                <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
              ) : displayName}
            </span>
          </Link>
        </MaybeProfileHoverCard>
      </div>
    </div>
  );
}

/** Conditionally wraps children in a ProfileHoverCard. */
function MaybeProfileHoverCard({ pubkey, disabled, children }: { pubkey: string; disabled?: boolean; children: React.ReactNode }) {
  if (disabled) {
    return <>{children}</>;
  }
  return (
    <ProfileHoverCard pubkey={pubkey} asChild>
      {children}
    </ProfileHoverCard>
  );
}
