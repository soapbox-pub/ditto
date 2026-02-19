import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle, Repeat2, Zap, MoreHorizontal, Clock, Tag } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ReactionButton } from '@/components/ReactionButton';
import { RepostMenu } from '@/components/RepostMenu';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventStats } from '@/hooks/useTrending';
import { genUserName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';
import { canZap } from '@/lib/canZap';
import { cn } from '@/lib/utils';
import { Nip05Badge } from '@/components/Nip05Badge';
import { nip19 } from 'nostr-tools';
import { useMemo, useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ZapDialog } from '@/components/ZapDialog';

interface ArticleCardProps {
  event: NostrEvent;
  className?: string;
  /** If true, hide action buttons (used for embeds). */
  compact?: boolean;
}

/** Formats a sats amount into a compact human-readable string. */
function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return sats.toString();
}

/** Gets a tag value by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Gets all tag values by name. */
function getTags(tags: string[][], name: string): string[] {
  return tags.filter(([n]) => n === name).map(([, v]) => v);
}

/** Encodes the NIP-19 identifier for navigating to an event. */
function encodeEventId(event: NostrEvent): string {
  const dTag = getTag(event.tags, 'd');
  if (dTag) {
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
  }
  return nip19.neventEncode({ id: event.id, author: event.pubkey });
}

/** Formats a timestamp into a readable date like "Feb 16, 2026". */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Truncates text to a max length with ellipsis. */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '…';
}

export function ArticleCard({ event, className, compact }: ArticleCardProps) {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(event.pubkey);
  const nip05 = metadata?.nip05;
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);
  const encodedId = useMemo(() => encodeEventId(event), [event]);
  const { data: stats } = useEventStats(event.id);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // Extract article metadata
  const title = getTag(event.tags, 'title') || 'Untitled Article';
  const summary = getTag(event.tags, 'summary');
  const imageUrl = getTag(event.tags, 'image');
  const publishedAt = getTag(event.tags, 'published_at');
  const hashtags = getTags(event.tags, 't').slice(0, 5);
  
  // Determine if this is a recipe (has zapcooking tags)
  const isRecipe = hashtags.some(tag => tag.toLowerCase().includes('zapcooking'));

  // Use published_at if available, otherwise use created_at
  const displayDate = publishedAt ? parseInt(publishedAt) : event.created_at;

  // Check if the current user can zap this event's author
  const canZapAuthor = user && canZap(metadata);

  // Handler to navigate to article detail
  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Don't navigate if clicking on interactive elements or dialogs
    if (
      target.closest('button') ||
      target.closest('a') ||
      target.closest('[role="dialog"]') ||
      target.closest('[data-radix-dialog-overlay]') ||
      target.closest('[data-radix-dialog-content]') ||
      target.closest('[data-vaul-drawer]') ||
      target.closest('[data-vaul-drawer-overlay]')
    ) {
      return;
    }

    navigate(`/${encodedId}`);
  };

  return (
    <article
      className={cn(
        'group cursor-pointer',
        className,
      )}
      onClick={handleCardClick}
    >
      <Card className="border-border hover:border-primary/50 transition-all hover:shadow-md">
        <CardContent className="p-0">
          {/* Article image */}
          {imageUrl && (
            <div className="relative aspect-[2/1] overflow-hidden rounded-t-lg">
              <img
                src={imageUrl}
                alt={title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
              {isRecipe && (
                <Badge className="absolute top-3 right-3 bg-amber-500/90 text-white border-0">
                  Recipe
                </Badge>
              )}
            </div>
          )}

          <div className="p-4 space-y-3">
            {/* Author info */}
            <div className="flex items-center gap-2">
              {author.isLoading ? (
                <>
                  <Skeleton className="size-8 rounded-full shrink-0" />
                  <Skeleton className="h-4 w-24" />
                </>
              ) : (
                <>
                  <Link to={`/${npub}`} className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Avatar className="size-8">
                      <AvatarImage src={metadata?.picture} alt={displayName} />
                      <AvatarFallback className="bg-primary/20 text-primary text-xs">
                        {displayName[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
                    <Link
                      to={`/${npub}`}
                      className="font-medium hover:underline truncate"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {displayName}
                    </Link>
                    {nip05 && (
                      <>
                        <span>·</span>
                        <Nip05Badge nip05={nip05} />
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Article title */}
            <h2 className="text-xl font-bold leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {title}
            </h2>

            {/* Article summary */}
            {summary && (
              <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                {summary}
              </p>
            )}

            {/* If no summary, show truncated content */}
            {!summary && event.content && (
              <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                {truncate(event.content.replace(/^#+\s+/gm, '').replace(/\n/g, ' '), 200)}
              </p>
            )}

            {/* Hashtags */}
            {hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {hashtags.map((tag) => (
                  <Link
                    key={tag}
                    to={`/t/${encodeURIComponent(tag)}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Tag className="size-3" />
                    {tag}
                  </Link>
                ))}
              </div>
            )}

            {/* Metadata footer */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                <span>{formatDate(displayDate)}</span>
              </div>

              {/* Action buttons */}
              {!compact && (
                <div className="flex items-center gap-3 -mr-2">
                  <button
                    className="flex items-center gap-1 p-1.5 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    title="Comments"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MessageCircle className="size-4" />
                    {stats?.replies ? <span className="text-xs tabular-nums">{stats.replies}</span> : null}
                  </button>

                  <RepostMenu event={event}>
                    <button
                      className="flex items-center gap-1 p-1.5 rounded-full text-muted-foreground hover:text-green-500 hover:bg-green-500/10 transition-colors"
                      title="Repost"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Repeat2 className="size-4" />
                      {(stats?.reposts || stats?.quotes) ? <span className="text-xs tabular-nums">{(stats?.reposts ?? 0) + (stats?.quotes ?? 0)}</span> : null}
                    </button>
                  </RepostMenu>

                  <ReactionButton
                    eventId={event.id}
                    eventPubkey={event.pubkey}
                    eventKind={event.kind}
                    reactionCount={stats?.reactions}
                    compact
                  />

                  {canZapAuthor && (
                    <ZapDialog target={event}>
                      <button
                        className="flex items-center gap-1 p-1.5 rounded-full text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                        title="Zap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Zap className="size-4" />
                        {stats?.zapAmount ? <span className="text-xs tabular-nums">{formatSats(stats.zapAmount)}</span> : null}
                      </button>
                    </ZapDialog>
                  )}

                  <button
                    className="p-1.5 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    title="More"
                    onClick={(e) => { e.stopPropagation(); setMoreMenuOpen(true); }}
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
    </article>
  );
}
