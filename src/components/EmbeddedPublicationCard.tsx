/**
 * Compact preview card for PressStr-style publications
 * (magazine kind 34609, magazine issue 39731, ebook 33953).
 *
 * Laid out like a book/magazine listing: a portrait cover on the left, title +
 * meta on the right. Clicking navigates to the publication's naddr detail page.
 * Used for both feed NoteCards and naddr / nevent quote embeds.
 */

import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { BookOpen, Newspaper, FileText } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { EmojifiedText } from '@/components/CustomEmoji';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { getAvatarShape } from '@/lib/avatarShape';
import { cn } from '@/lib/utils';
import {
  parsePublication,
  publicationNaddr,
  formatFileSize,
  MAGAZINE_KIND,
  MAGAZINE_ISSUE_KIND,
} from '@/lib/publications';

interface EmbeddedPublicationCardProps {
  event: NostrEvent;
  className?: string;
  /** When true, the author ProfileHoverCard is disabled (avoids nesting). */
  disableHoverCards?: boolean;
  /** When true, hides the author byline (context already shows the author). */
  hideAuthor?: boolean;
}

export function EmbeddedPublicationCard({
  event,
  className,
  disableHoverCards,
  hideAuthor,
}: EmbeddedPublicationCardProps) {
  const navigate = useNavigate();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || metadata?.display_name || 'Anonymous';
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const avatarShape = getAvatarShape(metadata);

  const pub = useMemo(() => parsePublication(event), [event]);
  const naddrId = useMemo(() => publicationNaddr(event), [event]);

  const isMagazine = event.kind === MAGAZINE_KIND;
  const isIssue = event.kind === MAGAZINE_ISSUE_KIND;
  const kindLabel = isMagazine ? 'Magazine' : isIssue ? 'Magazine Issue' : 'Ebook';
  const KindIcon = isMagazine || isIssue ? Newspaper : BookOpen;

  const go = () => navigate(`/${naddrId}`);

  return (
    <div
      className={cn(
        'group flex gap-3 rounded-2xl border border-border p-3',
        'cursor-pointer transition-colors hover:bg-secondary/40',
        className,
      )}
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        go();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          go();
        }
      }}
    >
      {/* Cover */}
      <div className="shrink-0">
        {pub.image ? (
          <img
            src={pub.image}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn(
              'rounded-lg border object-cover',
              isMagazine ? 'size-16' : 'h-24 w-16 aspect-[2/3]',
            )}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div
            className={cn(
              'flex items-center justify-center rounded-lg border bg-muted',
              isMagazine ? 'size-16' : 'h-24 w-16',
            )}
          >
            <KindIcon className="size-7 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <KindIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{kindLabel}</span>
          {isIssue && pub.issue && <span className="text-primary">· Issue {pub.issue}</span>}
        </div>

        <p className="mt-0.5 line-clamp-2 text-base font-semibold leading-snug">{pub.title}</p>

        {pub.authors.length > 0 && (
          <p className="line-clamp-1 text-sm text-muted-foreground">by {pub.authors.join(', ')}</p>
        )}

        {pub.summary && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{pub.summary}</p>
        )}

        <div className="mt-auto flex items-center gap-1.5 pt-1.5 text-xs text-muted-foreground">
          {!hideAuthor && (
            <>
              <MaybeProfileHoverCard pubkey={event.pubkey} disabled={disableHoverCards}>
                <Link
                  to={profileUrl}
                  className="flex w-fit min-w-0 items-center gap-1.5 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Avatar shape={avatarShape} className="size-5 shrink-0">
                    <AvatarImage src={metadata?.picture} alt={displayName} />
                    <AvatarFallback className="bg-primary/20 text-[10px] text-primary">
                      {displayName[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate font-medium text-muted-foreground">
                    {author.data?.event ? (
                      <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
                    ) : (
                      displayName
                    )}
                  </span>
                </Link>
              </MaybeProfileHoverCard>
              {!isMagazine && <span aria-hidden="true">·</span>}
            </>
          )}
          {!isMagazine && (
            <>
              <FileText className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{pub.format}</span>
              {typeof pub.size === 'number' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{formatFileSize(pub.size)}</span>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Conditionally wraps children in a ProfileHoverCard. */
function MaybeProfileHoverCard({
  pubkey,
  disabled,
  children,
}: {
  pubkey: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <>{children}</>;
  }
  return (
    <ProfileHoverCard pubkey={pubkey} asChild>
      {children}
    </ProfileHoverCard>
  );
}
