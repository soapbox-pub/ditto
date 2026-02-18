import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle, Repeat2, Zap, MoreHorizontal, Play } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteContent } from '@/components/NoteContent';
import { VideoPlayer } from '@/components/VideoPlayer';
import { ImageGallery } from '@/components/ImageGallery';
import { ReactionButton } from '@/components/ReactionButton';
import { PollContent } from '@/components/PollContent';
import { GeocacheContent } from '@/components/GeocacheContent';
import { FoundLogContent } from '@/components/FoundLogContent';
import { ColorMomentContent } from '@/components/ColorMomentContent';
import { FollowPackContent } from '@/components/FollowPackContent';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { useAuthor } from '@/hooks/useAuthor';
import { useEventStats } from '@/hooks/useTrending';
import { genUserName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';
import { nip19 } from 'nostr-tools';
import { useMemo, useState, useRef, useEffect } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { ZapDialog } from '@/components/ZapDialog';

interface NoteCardProps {
  event: NostrEvent;
  className?: string;
  /** If set, shows a "Reposted by" header with this pubkey. */
  repostedBy?: string;
  /** If true, hide action buttons (used for embeds). */
  compact?: boolean;
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
  return content.match(urlRegex) || [];
}

/** Extracts video URLs from note content. */
function extractVideos(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+\.(mp4|webm|mov)(\?[^\s]*)?/gi;
  return content.match(urlRegex) || [];
}

/** Gets a tag value by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Parsed imeta entry with url and optional thumbnail. */
interface ImetaEntry {
  url: string;
  thumbnail?: string;
  mime?: string;
}

/** Parse all imeta tags into a map keyed by URL. Works for any event kind. */
function parseImetaMap(tags: string[][]): Map<string, ImetaEntry> {
  const map = new Map<string, ImetaEntry>();
  for (const tag of tags) {
    if (tag[0] !== 'imeta') continue;
    const entry: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const part = tag[i];
      const spaceIdx = part.indexOf(' ');
      if (spaceIdx === -1) continue;
      const key = part.slice(0, spaceIdx);
      const value = part.slice(spaceIdx + 1);
      entry[key] = value;
    }
    if (entry.url) {
      map.set(entry.url, {
        url: entry.url,
        thumbnail: entry.image,
        mime: entry.m,
      });
    }
  }
  return map;
}

/** Parse single imeta tag into structured object (legacy, for kind 34236 vines). */
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

export function NoteCard({ event, className, repostedBy, compact }: NoteCardProps) {
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

  // Handler to navigate to post detail, but only if click didn't originate from a modal
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on interactive elements or if a modal/dialog is involved
    const target = e.target as HTMLElement;
    
    // Check if click is on or within a dialog/drawer/portal element
    if (
      target.closest('[role="dialog"]') ||
      target.closest('[data-radix-dialog-overlay]') ||
      target.closest('[data-radix-dialog-content]') ||
      target.closest('[data-vaul-drawer]') ||
      target.closest('[data-vaul-drawer-overlay]') ||
      target.closest('[data-testid="zap-modal"]')
    ) {
      return;
    }

    navigate(`/${encodedId}`);
  };

  const isVine = event.kind === 34236;
  const isPoll = event.kind === 1068;
  const isGeocache = event.kind === 37516;
  const isFoundLog = event.kind === 7516;
  const isTreasure = isGeocache || isFoundLog;
  const isColor = event.kind === 3367;
  const isFollowPack = event.kind === 39089 || event.kind === 30000;
  const isTextNote = !isVine && !isPoll && !isGeocache && !isFoundLog && !isColor && !isFollowPack;

  // Kind 1 specific
  const images = useMemo(() => isTextNote ? extractImages(event.content) : [], [event.content, isTextNote]);
  const videos = useMemo(() => isTextNote ? extractVideos(event.content) : [], [event.content, isTextNote]);
  const imetaMap = useMemo(() => isTextNote ? parseImetaMap(event.tags) : new Map<string, ImetaEntry>(), [event.tags, isTextNote]);
  const isReply = isTextNote && event.tags.some(([name]) => name === 'e');
  
  // Find the person being replied to
  const replyTo = isTextNote && isReply ? (() => {
    // First try to find a p tag that's not a mention
    const directReply = event.tags.find(([name, , , marker]) => name === 'p' && marker !== 'mention');
    if (directReply) return directReply;
    
    // If no direct reply p tag, check if there's a root or reply e tag with a pubkey
    const rootOrReply = event.tags.find(([name, , , marker]) => 
      name === 'e' && (marker === 'root' || marker === 'reply')
    );
    if (rootOrReply?.[4]) {
      // Return a p tag format with the pubkey from the e tag
      return ['p', rootOrReply[4]];
    }
    
    // Fallback: if this is a reply but all p tags are mentions, use the first p tag anyway
    // This handles cases where clients mark all p tags as mentions
    const firstP = event.tags.find(([name]) => name === 'p');
    return firstP;
  })() : undefined;

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
      onClick={handleCardClick}
    >
      {/* Repost header */}
      {repostedBy && (
        <RepostHeader pubkey={repostedBy} />
      )}

      {/* Treasure header — "<chest> <name> hid/found a treasure" */}
      {isTreasure && (
        <TreasureHeader pubkey={event.pubkey} variant={isGeocache ? 'hid' : 'found'} />
      )}

      {/* Reply context (kind 1 only) */}
      {isReply && replyTo?.[1] && (
        <ReplyContext pubkey={replyTo[1]} />
      )}

      {/* Header: avatar + name/handle stacked */}
      <div className="flex items-center gap-3">
        {author.isLoading ? (
          <>
            <Skeleton className="size-11 rounded-full shrink-0" />
            <div className="min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-36" />
            </div>
          </>
        ) : (
          <>
            <Link to={`/${npub}`} className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <Avatar className="size-11">
                <AvatarImage src={metadata?.picture} alt={displayName} />
                <AvatarFallback className="bg-primary/20 text-primary text-sm">
                  {displayName[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Link
                  to={`/${npub}`}
                  className="font-bold text-[15px] hover:underline truncate"
                  onClick={(e) => e.stopPropagation()}
                >
                  {displayName}
                </Link>
                {metadata?.bot && (
                  <span className="text-xs text-primary shrink-0" title="Bot account">🤖</span>
                )}
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                {nip05 && (
                  <span className="truncate">@{nip05}</span>
                )}
                {nip05 && <span className="shrink-0">·</span>}
                <span className="shrink-0 hover:underline">
                  {timeAgo(event.created_at)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Content — kind-based dispatch */}
      {isVine ? (
        <>
          {vineTitle && <p className="text-[15px] mt-2 leading-relaxed">{vineTitle}</p>}
          <VineMedia imeta={imeta} hashtags={hashtags} />
        </>
      ) : isPoll ? (
        <PollContent event={event} />
      ) : isGeocache ? (
        <GeocacheContent event={event} />
      ) : isFoundLog ? (
        <FoundLogContent event={event} />
      ) : isColor ? (
        <ColorMomentContent event={event} />
      ) : isFollowPack ? (
        <FollowPackContent event={event} />
      ) : (
        <>
          <div className="mt-2">
            <NoteContent event={event} className="text-[15px] leading-relaxed" />
          </div>
          <NoteMedia images={images} videos={videos} imetaMap={imetaMap} />
        </>
      )}

      {/* Action buttons — hidden in compact/embed mode */}
      {!compact && (
        <>
          <div className="flex items-center gap-6 mt-3 -ml-2">
            <button
              className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Reply"
              onClick={(e) => { e.stopPropagation(); setReplyOpen(true); }}
            >
              <MessageCircle className="size-[18px]" />
              {stats?.replies ? <span className="text-sm tabular-nums">{stats.replies}</span> : null}
            </button>

            <button
              className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-green-500 hover:bg-green-500/10 transition-colors"
              title="Repost"
              onClick={(e) => e.stopPropagation()}
            >
              <Repeat2 className="size-[18px]" />
              {(stats?.reposts || stats?.quotes) ? <span className="text-sm tabular-nums">{(stats?.reposts ?? 0) + (stats?.quotes ?? 0)}</span> : null}
            </button>

            <ReactionButton
              eventId={event.id}
              eventPubkey={event.pubkey}
              eventKind={event.kind}
              reactionCount={stats?.reactions}
            />

            <ZapDialog target={event}>
              <button
                className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                title="Zap"
              >
                <Zap className="size-[18px]" />
                {stats?.zapAmount ? <span className="text-sm tabular-nums">{formatSats(stats.zapAmount)}</span> : null}
              </button>
            </ZapDialog>

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
        </>
      )}
    </article>
  );
}

/** Media content for kind 1 text notes — renders images and videos. */
function NoteMedia({ images, videos, imetaMap }: { images: string[]; videos: string[]; imetaMap: Map<string, ImetaEntry> }) {
  if (images.length === 0 && videos.length === 0) return null;

  return (
    <>
      {/* Videos — each rendered with play/pause overlay */}
      {videos.map((url, i) => (
        <NoteVideoPlayer key={`v-${i}`} url={url} poster={imetaMap.get(url)?.thumbnail} />
      ))}

      {/* Images */}
      <ImageGallery images={images} maxGridHeight="400px" />
    </>
  );
}

/** Inline video player for kind 1 notes. */
function NoteVideoPlayer({ url, poster }: { url: string; poster?: string }) {
  return <VideoPlayer src={url} poster={poster} />;
}

/** Media content for kind 34236 vine events — rendered at full card width. */
function VineMedia({ imeta, hashtags }: { imeta?: { url?: string; thumbnail?: string }; hashtags: string[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Pause video when scrolled out of view
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && !video.paused) {
          video.pause();
        }
      },
      { threshold: 0.25 },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

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
      {imeta?.url && (
        <div
          ref={containerRef}
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

function RepostHeader({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name || genUserName(pubkey);

  return (
    <div className="flex items-center text-xs text-muted-foreground mb-1 ml-14">
      <Repeat2 className="size-3.5 mr-1.5" />
      {author.isLoading ? (
        <Skeleton className="h-3 w-20 inline-block" />
      ) : (
        <Link
          to={`/${nip19.npubEncode(pubkey)}`}
          className="font-medium hover:underline mr-1"
          onClick={(e) => e.stopPropagation()}
        >
          {name}
        </Link>
      )}
      <span className={author.isLoading ? 'ml-1' : ''}>reposted</span>
    </div>
  );
}

function TreasureHeader({ pubkey, variant }: { pubkey: string; variant: 'hid' | 'found' }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name || genUserName(pubkey);

  return (
    <div className="flex items-center text-xs text-muted-foreground mb-1 ml-14">
      <ChestIcon className="size-3.5 mr-1.5" />
      {author.isLoading ? (
        <Skeleton className="h-3 w-20 inline-block" />
      ) : (
        <Link
          to={`/${nip19.npubEncode(pubkey)}`}
          className="font-medium hover:underline mr-1"
          onClick={(e) => e.stopPropagation()}
        >
          {name}
        </Link>
      )}
      <span className={author.isLoading ? 'ml-1' : ''}>
        {variant === 'hid' ? 'hid a treasure' : 'found a treasure'}
      </span>
    </div>
  );
}

function ReplyContext({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name || genUserName(pubkey);

  return (
    <div className="flex items-center text-sm text-muted-foreground mb-1 ml-14">
      <span className="mr-1">Replying to</span>
      {author.isLoading ? (
        <Skeleton className="h-3.5 w-20 inline-block" />
      ) : (
        <Link to={`/${nip19.npubEncode(pubkey)}`} className="text-primary hover:underline">
          @{name}
        </Link>
      )}
    </div>
  );
}
