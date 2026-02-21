import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle, Zap, MoreHorizontal, Play, Radio, Users } from 'lucide-react';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteContent } from '@/components/NoteContent';
import { VideoPlayer } from '@/components/VideoPlayer';
import { ImageGallery } from '@/components/ImageGallery';
import { ReactionButton } from '@/components/ReactionButton';
import { RepostMenu } from '@/components/RepostMenu';
import { PollContent } from '@/components/PollContent';
import { GeocacheContent } from '@/components/GeocacheContent';
import { FoundLogContent } from '@/components/FoundLogContent';
import { ColorMomentContent } from '@/components/ColorMomentContent';
import { FollowPackContent } from '@/components/FollowPackContent';
import { ArticleContent } from '@/components/ArticleContent';
import { MagicDeckContent } from '@/components/MagicDeckContent';
import { LiveStreamPlayer } from '@/components/LiveStreamPlayer';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { ReplyContext } from '@/components/ReplyContext';
import { Nip05Badge } from '@/components/Nip05Badge';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventStats } from '@/hooks/useTrending';
import { getDisplayName } from '@/lib/getDisplayName';
import { genUserName } from '@/lib/genUserName';

import { getProfileUrl } from '@/lib/profileUrl';
import { timeAgo } from '@/lib/timeAgo';
import { canZap } from '@/lib/canZap';
import { cn } from '@/lib/utils';
import { nip19 } from 'nostr-tools';
import { useMemo, useState, useRef, useEffect } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { ZapDialog } from '@/components/ZapDialog';
import { ContentWarningGuard, getContentWarning } from '@/components/ContentWarningGuard';
import { useAppContext } from '@/hooks/useAppContext';

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
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const author = useAuthor(event.pubkey);

  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const nip05 = metadata?.nip05;
  const profileUrl = useMemo(() => getProfileUrl(event.pubkey, metadata), [event.pubkey, metadata]);
  const encodedId = useMemo(() => encodeEventId(event), [event]);
  const { data: stats } = useEventStats(event.id);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  // Check if the current user can zap this event's author
  const canZapAuthor = user && canZap(metadata);

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
  const isArticle = event.kind === 30023;
  const isMagicDeck = event.kind === 37381;
  const isStream = event.kind === 30311;
  const isTextNote = !isVine && !isPoll && !isGeocache && !isFoundLog && !isColor && !isFollowPack && !isArticle && !isMagicDeck && !isStream;

  // Kind 1 specific
  const images = useMemo(() => isTextNote ? extractImages(event.content) : [], [event.content, isTextNote]);
  const videos = useMemo(() => isTextNote ? extractVideos(event.content) : [], [event.content, isTextNote]);
  const imetaMap = useMemo(() => isTextNote ? parseImetaMap(event.tags) : new Map<string, ImetaEntry>(), [event.tags, isTextNote]);
  const isReply = isTextNote && event.tags.some(([name]) => name === 'e');
  
  // Find all people being replied to (for "Replying to @user1 and @user2")
  const replyToPubkeys = useMemo(() => {
    if (!isTextNote || !isReply) return [];
    
    // Get all p tags that aren't marked as mentions
    const pTags = event.tags.filter(([name, , , marker]) => name === 'p' && marker !== 'mention');
    
    if (pTags.length > 0) {
      // Remove duplicates and return pubkeys
      return [...new Set(pTags.map(([, pubkey]) => pubkey))];
    }
    
    // Fallback: if all p tags are mentions, use all p tags anyway
    const allPTags = event.tags.filter(([name]) => name === 'p');
    return [...new Set(allPTags.map(([, pubkey]) => pubkey))];
  }, [event.tags, isTextNote, isReply]);

  // Kind 34236 specific
  const imeta = useMemo(() => isVine ? parseImeta(event.tags) : undefined, [event.tags, isVine]);
  const vineTitle = isVine ? getTag(event.tags, 'title') : undefined;
  const hashtags = isVine ? event.tags.filter(([n]) => n === 't').map(([, v]) => v) : [];

  // NIP-36: If the event has a content-warning and the policy is "hide", skip rendering entirely
  if (getContentWarning(event) !== undefined && config.contentWarningPolicy === 'hide') {
    return null;
  }

  // Hide magic decks tagged t:unlisted and geocaches tagged t:hidden
  if (isMagicDeck && event.tags.some(([n, v]) => n === 't' && v === 'unlisted')) {
    return null;
  }
  if (isGeocache && event.tags.some(([n, v]) => n === 't' && v === 'hidden')) {
    return null;
  }

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

      {/* Stream header — "<radio> <name> is streaming / streamed" */}
      {isStream && (
        <StreamHeader pubkey={event.pubkey} isLive={getTag(event.tags, 'status') === 'live'} />
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
            <ProfileHoverCard pubkey={event.pubkey} asChild>
              <Link to={profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <Avatar className="size-11">
                  <AvatarImage src={metadata?.picture} alt={displayName} />
                  <AvatarFallback className="bg-primary/20 text-primary text-sm">
                    {displayName[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Link>
            </ProfileHoverCard>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <ProfileHoverCard pubkey={event.pubkey} asChild>
                  <Link
                    to={profileUrl}
                    className="font-bold text-[15px] hover:underline truncate"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {author.data?.event ? (
                      <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
                    ) : displayName}
                  </Link>
                </ProfileHoverCard>
                {metadata?.bot && (
                  <span className="text-xs text-primary shrink-0" title="Bot account">🤖</span>
                )}
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 pr-2">
                {nip05 && <Nip05Badge nip05={nip05} />}
                {nip05 && <span className="shrink-0">·</span>}
                <span className="shrink-0 hover:underline whitespace-nowrap">
                  {timeAgo(event.created_at)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Reply context (kind 1 only) — shown above content */}
      {isReply && replyToPubkeys.length > 0 && (
        <ReplyContext pubkeys={replyToPubkeys} />
      )}

      {/* Content — kind-based dispatch, guarded by NIP-36 content-warning */}
      <ContentWarningGuard event={event}>
        {isVine ? (
          <>
            {vineTitle && <p className="text-[15px] mt-2 leading-relaxed break-words overflow-hidden">{vineTitle}</p>}
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
        ) : isArticle ? (
          <ArticleContent event={event} preview className="mt-2" />
        ) : isMagicDeck ? (
          <MagicDeckContent event={event} />
        ) : isStream ? (
          <StreamContent event={event} />
        ) : (
          <>
            <div className="mt-2 break-words overflow-hidden">
              <NoteContent event={event} className="text-[15px] leading-relaxed" />
            </div>
            <NoteMedia images={images} videos={videos} imetaMap={imetaMap} />
          </>
        )}
      </ContentWarningGuard>

      {/* Action buttons — hidden in compact/embed mode */}
      {!compact && (
        <>
          <div className="flex items-center gap-5 mt-3 -ml-2">
            <button
              className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Reply"
              onClick={(e) => { e.stopPropagation(); setReplyOpen(true); }}
            >
              <MessageCircle className="size-5" />
              {stats?.replies ? <span className="text-sm tabular-nums">{stats.replies}</span> : null}
            </button>

            <RepostMenu event={event}>
              <button
                className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-green-500 hover:bg-green-500/10 transition-colors"
                title="Repost"
              >
                <RepostIcon className="size-5" />
                {(stats?.reposts || stats?.quotes) ? <span className="text-sm tabular-nums">{(stats?.reposts ?? 0) + (stats?.quotes ?? 0)}</span> : null}
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
                  className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                  title="Zap"
                >
                  <Zap className="size-5" />
                  {stats?.zapAmount ? <span className="text-sm tabular-nums">{formatSats(stats.zapAmount)}</span> : null}
                </button>
              </ZapDialog>
            )}

            <button
              className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="More"
              onClick={(e) => { e.stopPropagation(); setMoreMenuOpen(true); }}
            >
              <MoreHorizontal className="size-5" />
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

/** Stream status badge config. */
function getStreamStatusConfig(status: string | undefined) {
  switch (status) {
    case 'live':
      return { label: 'LIVE', className: 'bg-red-600 hover:bg-red-600 text-white border-red-600' };
    case 'ended':
      return { label: 'ENDED', className: 'bg-muted text-muted-foreground border-border' };
    case 'planned':
      return { label: 'PLANNED', className: 'bg-blue-600/90 hover:bg-blue-600/90 text-white border-blue-600' };
    default:
      return { label: status?.toUpperCase() || 'UNKNOWN', className: 'bg-muted text-muted-foreground border-border' };
  }
}

/** Inline content for kind 30311 live stream events. */
function StreamContent({ event }: { event: NostrEvent }) {
  const navigate = useNavigate();
  const title = getTag(event.tags, 'title') || 'Untitled Stream';
  const summary = getTag(event.tags, 'summary');
  const imageUrl = getTag(event.tags, 'image');
  const streamingUrl = getTag(event.tags, 'streaming');
  const status = getTag(event.tags, 'status');
  const currentParticipants = getTag(event.tags, 'current_participants');
  const statusConfig = getStreamStatusConfig(status);

  const isLive = status === 'live' && !!streamingUrl;

  const encodedId = useMemo(() => {
    const dTag = getTag(event.tags, 'd') || '';
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
  }, [event]);

  return (
    <div className="mt-2 space-y-2">
      {/* Stream player / thumbnail */}
      <div className="rounded-xl overflow-hidden border border-border">
        {isLive ? (
          // Inline live player — clicks on the player are intercepted so they don't navigate away
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <LiveStreamPlayer src={streamingUrl} poster={imageUrl} />
            {/* Status + viewer overlay on top of the player */}
            <div className="absolute top-2 left-2 z-10 flex items-center gap-2 pointer-events-none">
              <Badge variant="outline" className={cn('text-[10px]', statusConfig.className)}>
                <div className="size-1.5 bg-white rounded-full animate-pulse mr-1" />
                {statusConfig.label}
              </Badge>
              {currentParticipants && (
                <span className="flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                  <Users className="size-3" />
                  {currentParticipants}
                </span>
              )}
            </div>
          </div>
        ) : imageUrl ? (
          <div className="relative w-full aspect-video overflow-hidden bg-muted">
            <img
              src={imageUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
              }}
            />
            <div className="absolute top-2 left-2">
              <Badge variant="outline" className={cn('text-[10px]', statusConfig.className)}>
                {statusConfig.label}
              </Badge>
            </div>
            {currentParticipants && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                <Users className="size-3" />
                {currentParticipants}
              </div>
            )}
          </div>
        ) : (
          // No image, no live stream — show a minimal placeholder with status
          <div className="flex items-center gap-3 px-3 py-2.5 bg-muted/40">
            <Radio className="size-4 text-primary shrink-0" />
            <Badge variant="outline" className={cn('text-[10px]', statusConfig.className)}>
              {status === 'live' && <div className="size-1.5 bg-white rounded-full animate-pulse mr-1" />}
              {statusConfig.label}
            </Badge>
            {currentParticipants && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3" />
                {currentParticipants}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Title + summary — clickable to open stream details */}
      <button
        type="button"
        className="flex items-start gap-2 text-left w-full group"
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/${encodedId}`);
        }}
      >
        <Radio className="size-4 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 group-hover:underline">
            {title}
          </h3>
          {summary && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{summary}</p>
          )}
        </div>
      </button>
    </div>
  );
}

function RepostHeader({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name || genUserName(pubkey);
  const url = useMemo(() => getProfileUrl(pubkey, author.data?.metadata), [pubkey, author.data?.metadata]);

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 min-w-0">
      <div className="w-11 shrink-0 flex justify-end">
        <RepostIcon className="size-4 text-green-500 translate-y-px" />
      </div>
      <div className="flex items-center min-w-0">
        {author.isLoading ? (
          <Skeleton className="h-3 w-20 inline-block" />
        ) : (
          <Link
            to={url}
            className="font-medium hover:underline mr-1 truncate"
            onClick={(e) => e.stopPropagation()}
          >
            {author.data?.event ? <EmojifiedText tags={author.data.event.tags}>{name}</EmojifiedText> : name}
          </Link>
        )}
        <span className={cn("shrink-0", author.isLoading && 'ml-1')}>reposted</span>
      </div>
    </div>
  );
}

function StreamHeader({ pubkey, isLive }: { pubkey: string; isLive: boolean }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name || genUserName(pubkey);
  const url = useMemo(() => getProfileUrl(pubkey, author.data?.metadata), [pubkey, author.data?.metadata]);

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 min-w-0">
      <div className="w-11 shrink-0 flex justify-end">
        <Radio className={cn("size-4 translate-y-px", isLive ? "text-primary" : "text-muted-foreground")} />
      </div>
      <div className="flex items-center min-w-0">
        {author.isLoading ? (
          <Skeleton className="h-3 w-20 inline-block" />
        ) : (
          <Link
            to={url}
            className="font-medium hover:underline mr-1 truncate"
            onClick={(e) => e.stopPropagation()}
          >
            {author.data?.event ? <EmojifiedText tags={author.data.event.tags}>{name}</EmojifiedText> : name}
          </Link>
        )}
        <span className={cn("shrink-0", author.isLoading && 'ml-1')}>
          {isLive ? 'is streaming' : 'streamed'}
        </span>
      </div>
    </div>
  );
}

function TreasureHeader({ pubkey, variant }: { pubkey: string; variant: 'hid' | 'found' }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name || genUserName(pubkey);
  const url = useMemo(() => getProfileUrl(pubkey, author.data?.metadata), [pubkey, author.data?.metadata]);

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 min-w-0">
      <div className="w-11 shrink-0 flex justify-end">
        <ChestIcon className="size-4 text-primary translate-y-px" />
      </div>
      <div className="flex items-center min-w-0">
        {author.isLoading ? (
          <Skeleton className="h-3 w-20 inline-block" />
        ) : (
          <Link
            to={url}
            className="font-medium hover:underline mr-1 truncate"
            onClick={(e) => e.stopPropagation()}
          >
            {author.data?.event ? <EmojifiedText tags={author.data.event.tags}>{name}</EmojifiedText> : name}
          </Link>
        )}
        <span className={cn("shrink-0", author.isLoading && 'ml-1')}>
          {variant === 'hid' ? 'hid a treasure' : 'found a treasure'}
        </span>
      </div>
    </div>
  );
}


