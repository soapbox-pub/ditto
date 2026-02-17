import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle, Repeat2, Zap, MoreHorizontal, Play } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { NoteContent } from '@/components/NoteContent';
import { ReactionButton } from '@/components/ReactionButton';
import { useAuthor } from '@/hooks/useAuthor';
import { useEventStats } from '@/hooks/useTrending';
import { genUserName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';
import { nip19 } from 'nostr-tools';
import { useMemo, useState, useRef } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';

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

/** Gets a tag value by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Parse imeta tag into structured object for kind 34236. */
function parseImeta(tags: string[][]): { url?: string; thumbnail?: string } {
  const imetaTag = tags.find(([name]) => name === 'imeta');
  if (!imetaTag) return {};
  const result: Record<string, string> = {};
  for (let i = 1; i < imetaTag.length; i++) {
    const part = imetaTag[i];
    const spaceIdx = part.indexOf(' ');
    if (spaceIdx === -1) continue;
    const key = part.slice(0, spaceIdx);
    const value = part.slice(spaceIdx + 1);
    if (key === 'url') result.url = value;
    else if (key === 'image') result.thumbnail = value;
  }
  return result;
}

/** Encodes the NIP-19 identifier for navigating to an event. */
function encodeEventId(event: NostrEvent): string {
  // Addressable events use naddr
  if (event.kind >= 30000 && event.kind < 40000) {
    const dTag = getTag(event.tags, 'd');
    if (dTag) {
      return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
    }
  }
  return nip19.neventEncode({ id: event.id, author: event.pubkey });
}

export function NoteCard({ event, className }: NoteCardProps) {
  const navigate = useNavigate();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(event.pubkey);
  const nip05 = metadata?.nip05;
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);
  const encodedId = useMemo(() => encodeEventId(event), [event]);
  const { data: stats } = useEventStats(event.id);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  const isVine = event.kind === 34236;

  // Kind 1 specific
  const images = useMemo(() => isVine ? [] : extractImages(event.content), [event.content, isVine]);
  const isReply = !isVine && event.tags.some(([name]) => name === 'e');
  const replyTo = !isVine ? event.tags.find(([name, , , marker]) => name === 'p' && marker !== 'mention') : undefined;

  // Kind 34236 specific
  const imeta = useMemo(() => isVine ? parseImeta(event.tags) : undefined, [event.tags, isVine]);
  const vineTitle = isVine ? getTag(event.tags, 'title') : undefined;
  const hashtags = isVine ? event.tags.filter(([n]) => n === 't').map(([, v]) => v) : [];

  return (
    <article
      className={cn(
        'px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer',
        className,
      )}
      onClick={() => navigate(`/${encodedId}`)}
    >
      {/* Reply context (kind 1 only) */}
      {isReply && replyTo?.[1] && (
        <ReplyContext pubkey={replyTo[1]} />
      )}

      <div className="flex gap-3">
        {/* Avatar */}
        <Link to={`/${npub}`} className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <Avatar className="size-11">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-sm">
              {displayName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1.5 text-sm min-w-0">
            <Link
              to={`/${npub}`}
              className="font-bold hover:underline shrink-0 max-w-[40%] truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {displayName}
            </Link>
            {nip05 && (
              <span className="text-muted-foreground truncate min-w-0">
                @{nip05}
              </span>
            )}
            {metadata?.bot && (
              <span className="text-xs text-primary shrink-0" title="Bot account">🤖</span>
            )}
            <span className="text-muted-foreground shrink-0">·</span>
            <span className="text-muted-foreground shrink-0 hover:underline">
              {timeAgo(event.created_at)}
            </span>
          </div>

          {/* Body — kind-specific content */}
          {isVine ? (
            <VineBody title={vineTitle} imeta={imeta} hashtags={hashtags} />
          ) : (
            <NoteBody event={event} images={images} />
          )}

          {/* Action buttons — shared across all kinds */}
          <div className="flex items-center justify-between mt-2 max-w-md -ml-2">
            <button
              className="flex items-center gap-1 p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Reply"
              onClick={(e) => { e.stopPropagation(); setReplyOpen(true); }}
            >
              <MessageCircle className="size-[18px]" />
              {stats?.replies ? <span className="text-xs">{stats.replies}</span> : null}
            </button>

            <button
              className="flex items-center gap-1 p-2 rounded-full text-muted-foreground hover:text-green-500 hover:bg-green-500/10 transition-colors"
              title="Repost"
              onClick={(e) => e.stopPropagation()}
            >
              <Repeat2 className="size-[18px]" />
              {stats?.reposts ? <span className="text-xs">{stats.reposts}</span> : null}
            </button>

            <ReactionButton
              eventId={event.id}
              eventPubkey={event.pubkey}
              eventKind={event.kind}
              reactionCount={stats?.reactions}
              reactionEmojis={stats?.reactionEmojis}
            />

            <button
              className="flex items-center gap-1 p-2 rounded-full text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
              title="Zap"
              onClick={(e) => e.stopPropagation()}
            >
              <Zap className="size-[18px]" />
              {stats?.zapAmount ? <span className="text-xs">{formatSats(stats.zapAmount)}</span> : null}
            </button>

            <button
              className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="More"
              onClick={(e) => { e.stopPropagation(); setMoreMenuOpen(true); }}
            >
              <MoreHorizontal className="size-[18px]" />
            </button>
          </div>

          <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
          <ReplyComposeModal event={event} open={replyOpen} onOpenChange={setReplyOpen} />
        </div>
      </div>
    </article>
  );
}

/** Body content for kind 1 text notes. */
function NoteBody({ event, images }: { event: NostrEvent; images: string[] }) {
  return (
    <>
      <div className="mt-0.5">
        <NoteContent event={event} className="text-[15px] leading-relaxed" />
      </div>
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
    </>
  );
}

/** Body content for kind 34236 vine events. */
function VineBody({ title, imeta, hashtags }: { title?: string; imeta?: { url?: string; thumbnail?: string }; hashtags: string[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlayToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  return (
    <>
      {title && (
        <p className="text-[15px] mt-0.5 leading-relaxed">{title}</p>
      )}

      {imeta?.url && (
        <div
          className="relative mt-3 rounded-2xl overflow-hidden cursor-pointer"
          onClick={handlePlayToggle}
        >
          <video
            ref={videoRef}
            src={imeta.url}
            poster={imeta.thumbnail}
            className="w-full max-h-[70vh] object-cover"
            loop
            playsInline
            preload="none"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="size-14 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
                <Play className="size-7 text-white ml-1" fill="white" />
              </div>
            </div>
          )}
        </div>
      )}

      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {hashtags.slice(0, 5).map((tag) => (
            <Link
              key={tag}
              to={`/t/${encodeURIComponent(tag)}`}
              className="text-xs text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </>
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
