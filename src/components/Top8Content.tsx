/**
 * Top8Content
 *
 * Display for kind 18678 Top 8 updates (see NIP.md). A Top 8 is a *ranked*
 * list, so the card leads with the numbered grid rather than a plain row of
 * names — shuffling your number one is the news, and the card should show it.
 *
 * The kind number keypad-spells "1·TOP8".
 */

import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { Crown } from 'lucide-react';
import { FormattedMessage } from 'react-intl';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Top8Grid } from '@/components/Top8Grid';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { top8Pubkeys } from '@/hooks/useTop8';
import { getAvatarShape } from '@/lib/avatarShape';
import { getDisplayName } from '@/lib/getDisplayName';
import { cn } from '@/lib/utils';

interface Top8ContentProps {
  event: NostrEvent;
  /** Compact mode for feed cards (tighter padding). */
  compact?: boolean;
  className?: string;
}

export function Top8Content({ event, compact, className }: Top8ContentProps) {
  const pubkeys = useMemo(() => top8Pubkeys(event), [event]);

  if (pubkeys.length === 0) {
    return (
      <div className={cn('mt-2 px-4 py-3', className)}>
        <p className="text-sm text-muted-foreground italic">
          <FormattedMessage id="top8.card.empty" defaultMessage="An empty Top 8 — nobody made the cut." />
        </p>
      </div>
    );
  }

  return (
    <div className={cn('mt-3', className)}>
      <div
        className={cn(
          'rounded-xl border bg-gradient-to-br from-primary/10 via-background to-background',
          'shadow-sm motion-safe:transition-shadow motion-safe:duration-300 hover:shadow-md',
          compact ? 'p-4' : 'p-5 sm:p-6',
        )}
      >
        {/* Header band */}
        <div className="flex items-center gap-2 mb-4">
          <span className="flex items-center justify-center size-8 rounded-full bg-primary/15 text-primary shrink-0">
            <Crown className="size-[18px]" aria-hidden />
          </span>
          <h3
            className={cn('font-bold leading-none', compact ? 'text-lg' : 'text-xl')}
            style={{ fontFamily: 'var(--title-font-family, inherit)' }}
          >
            <FormattedMessage id="top8.card.title" defaultMessage="Top 8" />
          </h3>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            <FormattedMessage
              id="top8.card.count"
              defaultMessage="{count, plural, one {# person} other {# people}}"
              values={{ count: pubkeys.length }}
            />
          </span>
        </div>

        {/* The ranked grid — 2 columns on the narrowest screens, 4 above that,
            so a full Top 8 reads as the classic two rows of four. */}
        <Top8Grid pubkeys={pubkeys} columns={2} className="sm:grid-cols-4" size={compact ? 'sm' : 'md'} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact card for embedded notes / quote posts
// ---------------------------------------------------------------------------

interface Top8CompactProps {
  event: NostrEvent;
  className?: string;
}

/**
 * Minimal inline card for kind 18678 in embedded contexts. Shows the author
 * plus "Updated their Top 8 · N people" — the grid would be too heavy inside
 * a quote.
 */
export function Top8Compact({ event, className }: Top8CompactProps) {
  const navigate = useNavigate();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = getDisplayName(metadata, event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const count = useMemo(() => top8Pubkeys(event).length, [event]);

  const neventId = useMemo(
    () => nip19.neventEncode({ id: event.id, author: event.pubkey }),
    [event.id, event.pubkey],
  );

  const open = () => navigate(`/${neventId}`);

  return (
    <div
      className={cn(
        'group block rounded-2xl border overflow-hidden cursor-pointer transition-colors',
        'bg-gradient-to-br from-primary/10 to-background hover:border-primary/40',
        className,
      )}
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        open();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          open();
        }
      }}
    >
      <div className="px-3 py-2 space-y-1">
        {/* Author row */}
        <div className="flex items-center gap-2 min-w-0">
          {author.isLoading ? (
            <>
              <Skeleton className="size-5 rounded-full shrink-0" />
              <Skeleton className="h-3.5 w-24" />
            </>
          ) : (
            <>
              <ProfileHoverCard pubkey={event.pubkey} asChild>
                <Link to={profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Avatar shape={avatarShape} className="size-5">
                    <AvatarImage src={metadata?.picture} alt={displayName} />
                    <AvatarFallback className="text-[10px]">{displayName[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                </Link>
              </ProfileHoverCard>
              <ProfileHoverCard pubkey={event.pubkey} asChild>
                <Link
                  to={profileUrl}
                  className="text-sm font-semibold truncate hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {displayName}
                </Link>
              </ProfileHoverCard>
            </>
          )}
        </div>

        {/* Content line */}
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Crown className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span>
            <FormattedMessage id="top8.compact.summary" defaultMessage="Updated their Top 8" />
            {count > 0 && (
              <>
                {' · '}
                <span className="font-medium text-foreground">
                  <FormattedMessage
                    id="top8.compact.count"
                    defaultMessage="{count, plural, one {# person} other {# people}}"
                    values={{ count }}
                  />
                </span>
              </>
            )}
          </span>
        </p>
      </div>
    </div>
  );
}
