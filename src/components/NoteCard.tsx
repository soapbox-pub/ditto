import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle, Repeat2, Heart, Zap, MoreHorizontal } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { NoteContent } from '@/components/NoteContent';
import { useAuthor } from '@/hooks/useAuthor';
import { useEventStats } from '@/hooks/useTrending';
import { genUserName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';
import { nip19 } from 'nostr-tools';
import { useMemo, useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';

interface NoteCardProps {
  event: NostrEvent;
  className?: string;
}

/** Formats a sats amount into a compact human-readable string. */
function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return sats.toString();
}

/** Extracts image URLs from note content. */
function extractImages(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?/gi;
  const matches = content.match(urlRegex);
  return matches || [];
}

export function NoteCard({ event, className }: NoteCardProps) {
  const navigate = useNavigate();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(event.pubkey);
  const nip05 = metadata?.nip05;
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);
  const neventId = useMemo(() => nip19.neventEncode({ id: event.id, author: event.pubkey }), [event.id, event.pubkey]);
  const images = useMemo(() => extractImages(event.content), [event.content]);
  const { data: stats } = useEventStats(event.id);
  const [liked, setLiked] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // Check if content is a reply
  const isReply = event.tags.some(([name]) => name === 'e');
  const replyTo = event.tags.find(([name, , , marker]) => name === 'p' && marker !== 'mention');

  return (
    <article
      className={cn(
        'px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer',
        className,
      )}
      onClick={() => navigate(`/${neventId}`)}
    >
      {/* Reply context */}
      {isReply && replyTo && (
        <ReplyContext pubkey={replyTo[1]} />
      )}

      <div className="flex gap-3">
        {/* Avatar */}
        <Link to={`/${npub}`} className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <Avatar className="size-11">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-sm">
              {displayName[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1.5 text-sm">
            <Link
              to={`/${npub}`}
              className="font-bold hover:underline truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {displayName}
            </Link>
            {nip05 && (
              <span className="text-muted-foreground truncate">
                @{nip05}
              </span>
            )}
            {metadata?.bot && (
              <span className="text-xs text-primary" title="Bot account">🤖</span>
            )}
            <span className="text-muted-foreground shrink-0">·</span>
            <span className="text-muted-foreground shrink-0 hover:underline">
              {timeAgo(event.created_at)}
            </span>
          </div>

          {/* Text content */}
          <div className="mt-0.5">
            <NoteContent event={event} className="text-[15px] leading-relaxed" />
          </div>

          {/* Image attachments */}
          {images.length > 0 && (
            <div className={cn(
              'mt-3 rounded-2xl overflow-hidden border border-border',
              images.length > 1 && 'grid grid-cols-2 gap-0.5',
            )}>
              {images.slice(0, 4).map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <img
                    src={url}
                    alt=""
                    className="w-full h-auto max-h-[400px] object-cover"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between mt-2 max-w-md -ml-2">
            {/* Reply */}
            <button
              className="flex items-center gap-1 p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Reply"
              onClick={(e) => e.stopPropagation()}
            >
              <MessageCircle className="size-[18px]" />
              {stats?.replies ? <span className="text-xs">{stats.replies}</span> : null}
            </button>

            {/* Repost */}
            <button
              className="flex items-center gap-1 p-2 rounded-full text-muted-foreground hover:text-green-500 hover:bg-green-500/10 transition-colors"
              title="Repost"
              onClick={(e) => e.stopPropagation()}
            >
              <Repeat2 className="size-[18px]" />
              {stats?.reposts ? <span className="text-xs">{stats.reposts}</span> : null}
            </button>

            {/* Like */}
            <button
              className={cn(
                "flex items-center gap-1 p-2 rounded-full transition-colors",
                liked
                  ? "text-pink-500"
                  : "text-muted-foreground hover:text-pink-500 hover:bg-pink-500/10"
              )}
              title="Like"
              onClick={(e) => {
                e.stopPropagation();
                setLiked(!liked);
              }}
            >
              <Heart className={cn("size-[18px]", liked && "fill-pink-500")} />
              {stats?.reactions ? <span className="text-xs">{stats.reactions}</span> : null}
            </button>

            {/* Zap */}
            <button
              className="flex items-center gap-1 p-2 rounded-full text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
              title="Zap"
              onClick={(e) => e.stopPropagation()}
            >
              <Zap className="size-[18px]" />
              {stats?.zapAmount ? <span className="text-xs">{formatSats(stats.zapAmount)}</span> : null}
            </button>

            {/* More */}
            <button
              className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="More"
              onClick={(e) => {
                e.stopPropagation();
                setMoreMenuOpen(true);
              }}
            >
              <MoreHorizontal className="size-[18px]" />
            </button>
          </div>

          {/* More menu dialog */}
          <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
        </div>
      </div>
    </article>
  );
}

function ReplyContext({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name || genUserName(pubkey);

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1 ml-14">
      <span>Replying to</span>
      <Link to={`/${nip19.npubEncode(pubkey)}`} className="text-primary hover:underline">
        @{name}
      </Link>
    </div>
  );
}
