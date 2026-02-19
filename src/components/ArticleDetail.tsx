import { Link } from 'react-router-dom';
import { MessageCircle, Repeat2, Zap, MoreHorizontal, Clock, Tag, User, Calendar } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ReactionButton } from '@/components/ReactionButton';
import { RepostMenu } from '@/components/RepostMenu';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventStats } from '@/hooks/useTrending';
import { genUserName } from '@/lib/genUserName';
import { canZap } from '@/lib/canZap';
import { Nip05Badge } from '@/components/Nip05Badge';
import { nip19 } from 'nostr-tools';
import { useMemo, useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { ZapDialog } from '@/components/ZapDialog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ArticleDetailProps {
  event: NostrEvent;
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

/** Formats a timestamp into a full readable date. */
function formatFullDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ArticleDetail({ event }: ArticleDetailProps) {
  const { user } = useCurrentUser();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(event.pubkey);
  const nip05 = metadata?.nip05;
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);
  const { data: stats } = useEventStats(event.id);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  // Extract article metadata
  const title = getTag(event.tags, 'title') || 'Untitled Article';
  const summary = getTag(event.tags, 'summary');
  const imageUrl = getTag(event.tags, 'image');
  const publishedAt = getTag(event.tags, 'published_at');
  const hashtags = getTags(event.tags, 't');
  
  // Determine if this is a recipe (has zapcooking tags)
  const isRecipe = hashtags.some(tag => tag.toLowerCase().includes('zapcooking'));

  // Use published_at if available, otherwise use created_at
  const displayDate = publishedAt ? parseInt(publishedAt) : event.created_at;

  // Check if the current user can zap this event's author
  const canZapAuthor = user && canZap(metadata);

  return (
    <article className="max-w-3xl mx-auto">
      {/* Header image */}
      {imageUrl && (
        <div className="relative -mx-4 sm:mx-0 mb-8 aspect-[2.5/1] overflow-hidden sm:rounded-xl">
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
          {isRecipe && (
            <Badge className="absolute top-4 right-4 bg-amber-500 text-white border-0 text-sm px-3 py-1">
              🍳 Recipe
            </Badge>
          )}
        </div>
      )}

      {/* Article header */}
      <header className="mb-8 space-y-4">
        <h1 className="text-4xl md:text-5xl font-bold leading-tight">{title}</h1>
        
        {summary && (
          <p className="text-xl text-muted-foreground leading-relaxed">{summary}</p>
        )}

        {/* Author info */}
        <div className="flex items-center gap-3 pt-2">
          {author.isLoading ? (
            <>
              <Skeleton className="size-12 rounded-full shrink-0" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </>
          ) : (
            <>
              <Link to={`/${npub}`} className="shrink-0">
                <Avatar className="size-12">
                  <AvatarImage src={metadata?.picture} alt={displayName} />
                  <AvatarFallback className="bg-primary/20 text-primary">
                    {displayName[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <div className="space-y-1">
                <Link
                  to={`/${npub}`}
                  className="font-semibold text-base hover:underline block"
                >
                  {displayName}
                </Link>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {nip05 && (
                    <>
                      <Nip05Badge nip05={nip05} />
                      <span>·</span>
                    </>
                  )}
                  <div className="flex items-center gap-1">
                    <Calendar className="size-3.5" />
                    <span>{formatFullDate(displayDate)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Hashtags */}
        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {hashtags.map((tag) => (
              <Link
                key={tag}
                to={`/t/${encodeURIComponent(tag)}`}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-secondary text-sm hover:bg-secondary/80 transition-colors"
              >
                <Tag className="size-3.5" />
                {tag}
              </Link>
            ))}
          </div>
        )}
      </header>

      <Separator className="mb-8" />

      {/* Article content with markdown rendering */}
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-8">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Custom image rendering to handle responsive images
            img: ({ node, ...props }) => (
              <img
                {...props}
                className="rounded-lg w-full h-auto"
                loading="lazy"
              />
            ),
            // Custom link rendering
            a: ({ node, ...props }) => (
              <a
                {...props}
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              />
            ),
            // Custom code block rendering
            pre: ({ node, ...props }) => (
              <pre
                {...props}
                className="bg-secondary p-4 rounded-lg overflow-x-auto"
              />
            ),
            code: ({ node, ...props }) => (
              <code
                {...props}
                className="bg-secondary px-1.5 py-0.5 rounded text-sm"
              />
            ),
          }}
        >
          {event.content}
        </ReactMarkdown>
      </div>

      <Separator className="mb-6" />

      {/* Action buttons */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            title="Reply"
            onClick={() => setReplyOpen(true)}
          >
            <MessageCircle className="size-5" />
            {stats?.replies ? <span className="text-sm font-medium tabular-nums">{stats.replies}</span> : null}
          </button>

          <RepostMenu event={event}>
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-full text-muted-foreground hover:text-green-500 hover:bg-green-500/10 transition-colors"
              title="Repost"
            >
              <Repeat2 className="size-5" />
              {(stats?.reposts || stats?.quotes) ? <span className="text-sm font-medium tabular-nums">{(stats?.reposts ?? 0) + (stats?.quotes ?? 0)}</span> : null}
            </button>
          </RepostMenu>

          <ReactionButton
            eventId={event.id}
            eventPubkey={event.pubkey}
            eventKind={event.kind}
            reactionCount={stats?.reactions}
          />

          {canZapAuthor && (
            <ZapDialog target={event}>
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-full text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                title="Zap"
              >
                <Zap className="size-5" />
                {stats?.zapAmount ? <span className="text-sm font-medium tabular-nums">{formatSats(stats.zapAmount)}</span> : null}
              </button>
            </ZapDialog>
          )}
        </div>

        <button
          className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          title="More"
          onClick={() => setMoreMenuOpen(true)}
        >
          <MoreHorizontal className="size-5" />
        </button>
      </div>

      <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
      <ReplyComposeModal event={event} open={replyOpen} onOpenChange={setReplyOpen} />
    </article>
  );
}
