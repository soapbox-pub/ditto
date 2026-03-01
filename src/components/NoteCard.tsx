import { Link } from 'react-router-dom';
import { MessageCircle, Zap, MoreHorizontal, Play, Radio, Users, Palette } from 'lucide-react';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteContent, isSingleImagePost } from '@/components/NoteContent';
import { VideoPlayer } from '@/components/VideoPlayer';
import { ReactionButton } from '@/components/ReactionButton';
import { RepostMenu } from '@/components/RepostMenu';
import { PollContent } from '@/components/PollContent';
import { GeocacheContent } from '@/components/GeocacheContent';
import { FoundLogContent } from '@/components/FoundLogContent';
import { ColorMomentContent, ColorMomentEyeButton } from '@/components/ColorMomentContent';
import { FollowPackContent } from '@/components/FollowPackContent';
import { ArticleContent } from '@/components/ArticleContent';
import { WebxdcEmbed } from '@/components/WebxdcEmbed';
import { MagicDeckContent } from '@/components/MagicDeckContent';
import { FileMetadataContent } from '@/components/FileMetadataContent';
import { LiveStreamPlayer } from '@/components/LiveStreamPlayer';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { CardsIcon } from '@/components/icons/CardsIcon';
import { ReplyContext } from '@/components/ReplyContext';
import { CommentContext } from '@/components/CommentContext';
import { Nip05Badge } from '@/components/Nip05Badge';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useAuthor } from '@/hooks/useAuthor';
import { useNip05Verify } from '@/hooks/useNip05Verify';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventStats } from '@/hooks/useTrending';
import { getDisplayName } from '@/lib/getDisplayName';
import { genUserName } from '@/lib/genUserName';

import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useOpenPost } from '@/hooks/useOpenPost';
import { timeAgo } from '@/lib/timeAgo';
import { canZap } from '@/lib/canZap';
import { cn } from '@/lib/utils';
import { nip19 } from 'nostr-tools';
import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { ZapDialog } from '@/components/ZapDialog';
import { ContentWarningGuard, getContentWarning } from '@/components/ContentWarningGuard';
import { ThemeContent } from '@/components/ThemeContent';
import { useAppContext } from '@/hooks/useAppContext';
import { getParentEventId, isReplyEvent } from '@/lib/nostrEvents';

interface NoteCardProps {
  event: NostrEvent;
  className?: string;
  /** If set, shows a "Reposted by" header with this pubkey. */
  repostedBy?: string;
  /** If true, hide action buttons (used for embeds). */
  compact?: boolean;
  /** If true, render in threaded ancestor style: connector line below avatar, no bottom border. */
  threaded?: boolean;
  /** Like threaded but without the connector line — used for the last item in a thread (e.g. sub-reply hint). */
  threadedLast?: boolean;
}

/** Formats a sats amount into a compact human-readable string. */
function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return sats.toString();
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
  /** Summary text (used as webxdc app name for webxdc attachments). */
  summary?: string;
  /** Webxdc session UUID — present when the attachment is a stateful webxdc app. */
  webxdc?: string;
  /** Pixel dimensions from NIP-94 `dim` tag, e.g. "1280x720". */
  dim?: string;
  /** Blurhash placeholder from NIP-94 `blurhash` tag. */
  blurhash?: string;
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
        summary: entry.summary,
        webxdc: entry.webxdc,
        dim: entry.dim,
        blurhash: entry.blurhash,
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

export function NoteCard({ event, className, repostedBy, compact, threaded, threadedLast }: NoteCardProps) {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const author = useAuthor(event.pubkey);

  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const nip05 = metadata?.nip05;
  const { data: nip05Verified, isPending: nip05Pending } = useNip05Verify(nip05, event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const encodedId = useMemo(() => encodeEventId(event), [event]);
  const { data: stats } = useEventStats(event.id);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  // Check if the current user can zap this event's author
  const canZapAuthor = user && canZap(metadata);

  const { onClick: openPost, onAuxClick: auxOpenPost } = useOpenPost(`/${encodedId}`);

  // Handler to navigate to post detail, but only if click didn't originate from a modal
  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
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
    openPost();
  };

  const handleAuxClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
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
    auxOpenPost(e);
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
  const isFileMetadata = event.kind === 1063;
  const isThemeDefinition = event.kind === 36767;
  const isActiveTheme = event.kind === 16767;
  const isTheme = isThemeDefinition || isActiveTheme;
  const isTextNote = !isVine && !isPoll && !isGeocache && !isFoundLog && !isColor && !isFollowPack && !isArticle && !isMagicDeck && !isStream && !isFileMetadata && !isTheme;

  // Kind 1 specific — images now render inline in NoteContent, only videos go to NoteMedia
  const videos = useMemo(() => isTextNote ? extractVideos(event.content) : [], [event.content, isTextNote]);
  const imetaMap = useMemo(() => isTextNote ? parseImetaMap(event.tags) : new Map<string, ImetaEntry>(), [event.tags, isTextNote]);

  // Extract webxdc attachments from imeta tags
  const webxdcApps = useMemo(() => {
    if (!isTextNote) return [];
    return Array.from(imetaMap.values()).filter(
      (entry) => entry.mime === 'application/x-webxdc' || entry.mime === 'application/vnd.webxdc+zip',
    );
  }, [imetaMap, isTextNote]);
  const isComment = event.kind === 1111;
  const isReply = isTextNote && !isComment && isReplyEvent(event);
  
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

  // Extract the parent event ID for reply hover card preview
  const parentEventId = useMemo(() => {
    if (!isReply) return undefined;
    return getParentEventId(event);
  }, [event, isReply]);

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

  // Shared content block used in both normal and threaded layouts
  const contentBlock = (
    <>
      {/* Reply context (kind 1) or comment context (kind 1111) — shown above content */}
      {isComment && <CommentContext event={event} />}
      {isReply && replyToPubkeys.length > 0 && (
        <ReplyContext pubkeys={replyToPubkeys} parentEventId={parentEventId} />
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
        ) : isFileMetadata ? (
          <FileMetadataContent event={event} compact />
        ) : isTheme ? (
          <ThemeContent event={event} />
        ) : (
          <TruncatedNoteContent event={event} videos={videos} imetaMap={imetaMap} webxdcApps={webxdcApps} />
        )}
      </ContentWarningGuard>
    </>
  );

  // Shared author info block
  const authorInfo = author.isLoading ? (
    <div className="min-w-0 space-y-1.5">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-3 w-36" />
    </div>
  ) : (
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
        {nip05 && nip05Pending && <Skeleton className="h-3 w-24" />}
        {nip05 && nip05Pending && <span className="shrink-0">·</span>}
        {nip05 && nip05Verified && <Nip05Badge nip05={nip05} pubkey={event.pubkey} />}
        {nip05 && nip05Verified && <span className="shrink-0">·</span>}
        <span className="shrink-0 hover:underline whitespace-nowrap">
          {timeAgo(event.created_at)}
        </span>
      </div>
    </div>
  );

  // Shared avatar element
  const avatarElement = author.isLoading ? (
    <Skeleton className={cn((threaded || threadedLast) ? 'size-10' : 'size-11', 'rounded-full shrink-0')} />
  ) : (
    <ProfileHoverCard pubkey={event.pubkey} asChild>
      <Link to={profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <Avatar className={(threaded || threadedLast) ? 'size-10' : 'size-11'}>
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>
    </ProfileHoverCard>
  );

  // ── Shared action buttons (used in all layouts) ──
  const actionButtons = (
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
        {(isReposted: boolean) => (
          <button
            className={`flex items-center gap-1.5 p-2 rounded-full transition-colors ${isReposted ? 'text-accent hover:text-accent/80 hover:bg-accent/10' : 'text-muted-foreground hover:text-accent hover:bg-accent/10'}`}
            title={isReposted ? 'Undo repost' : 'Repost'}
          >
            <RepostIcon className="size-5" />
            {(stats?.reposts || stats?.quotes) ? <span className="text-sm tabular-nums">{(stats?.reposts ?? 0) + (stats?.quotes ?? 0)}</span> : null}
          </button>
        )}
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
  );

  // ── Threaded layout (with or without connector line) ──
  if (threaded || threadedLast) {
    return (
      <article
        className={cn(
          'px-4 pt-3 hover:bg-secondary/30 transition-colors cursor-pointer overflow-hidden',
          threaded ? 'pb-0' : 'pb-3 border-b border-border',
          className,
        )}
        onClick={handleCardClick}
        onAuxClick={handleAuxClick}
      >
        <div className="flex gap-3">
          <div className="flex flex-col items-center">
            {avatarElement}
            {threaded && <div className="w-0.5 flex-1 mt-2 bg-foreground/20 rounded-full" />}
          </div>
          <div className={cn('flex-1 min-w-0', threaded && 'pb-3')}>
            {authorInfo}
            {contentBlock}
            {actionButtons}
            <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
            <ReplyComposeModal event={event} open={replyOpen} onOpenChange={setReplyOpen} />
          </div>
        </div>
      </article>
    );
  }

  // ── Normal layout ──
  return (
    <article
        className={cn(
          'px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer overflow-hidden',
          className,
        )}
        onClick={handleCardClick}
        onAuxClick={handleAuxClick}
      >
      {/* Repost header */}
      {repostedBy && (
        <RepostHeader pubkey={repostedBy} />
      )}

      {/* Treasure header — "<chest> <name> hid/found a treasure" */}
      {isTreasure && (
        <TreasureHeader pubkey={event.pubkey} variant={isGeocache ? 'hid' : 'found'} />
      )}

      {/* Deck header — "<cards> <name> shared a deck" */}
      {isMagicDeck && !repostedBy && (
        <DeckHeader pubkey={event.pubkey} />
      )}

      {/* Stream header — "<radio> <name> is streaming / streamed" */}
      {isStream && (
        <StreamHeader pubkey={event.pubkey} isLive={getTag(event.tags, 'status') === 'live'} />
      )}

      {/* Theme header — "<palette> <name> shared/updated a theme" */}
      {isTheme && !repostedBy && (
        <ThemeHeader pubkey={event.pubkey} variant={isThemeDefinition ? 'shared' : 'updated'} />
      )}

      {/* Header: avatar + name/handle stacked */}
      <div className="flex items-center gap-3">
        {avatarElement}
        {authorInfo}
        {isColor && <ColorMomentEyeButton event={event} />}
      </div>

      {contentBlock}

      {/* Action buttons — hidden in compact/embed mode */}
      {!compact && (
        <>
          {actionButtons}
          <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
          <ReplyComposeModal event={event} open={replyOpen} onOpenChange={setReplyOpen} />
        </>
      )}
    </article>
  );
}

const MAX_HEIGHT = 400; // px — posts taller than this get truncated

/** Truncates long text note content with a "Read more" fade + button.
 *  Media attachments are also hidden behind the truncation and revealed on expand. */
function TruncatedNoteContent({ event, videos, imetaMap, webxdcApps = [] }: {
  event: NostrEvent;
  videos: string[];
  imetaMap: Map<string, ImetaEntry>;
  webxdcApps?: ImetaEntry[];
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const singleImage = isSingleImagePost(event);

  const measure = useCallback(() => {
    const el = contentRef.current;
    if (el) setOverflows(!singleImage && el.scrollHeight > MAX_HEIGHT);
  }, [singleImage]);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // Re-measure after images load — scrollHeight is unreliable before images have rendered.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const imgs = el.querySelectorAll('img');
    if (imgs.length === 0) return;
    imgs.forEach((img) => img.addEventListener('load', measure, { once: true }));
    return () => imgs.forEach((img) => img.removeEventListener('load', measure));
  }, [measure]);

  const showMedia = !overflows || expanded;

  return (
    <div className="mt-2 break-words overflow-hidden">
      <div
        ref={contentRef}
        style={!expanded && overflows ? { maxHeight: MAX_HEIGHT, overflow: 'hidden' } : undefined}
        className="relative"
      >
        <NoteContent event={event} className="text-[15px] leading-relaxed" />
        {!expanded && overflows && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        )}
      </div>
      {overflows && (
        <button
          className="mt-1 text-sm text-primary hover:underline"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
      {showMedia && (
        <NoteMedia videos={videos} imetaMap={imetaMap} webxdcApps={webxdcApps} />
      )}
    </div>
  );
}

/** Media content for kind 1 text notes — renders videos and webxdc apps (images render inline in NoteContent). */
function NoteMedia({ videos, imetaMap, webxdcApps = [] }: { videos: string[]; imetaMap: Map<string, ImetaEntry>; webxdcApps?: ImetaEntry[] }) {
  if (videos.length === 0 && webxdcApps.length === 0) return null;

  return (
    <>
      {/* Videos — each rendered with play/pause overlay */}
      {videos.map((url, i) => (
        <NoteVideoPlayer key={`v-${i}`} url={url} poster={imetaMap.get(url)?.thumbnail} dim={imetaMap.get(url)?.dim} blurhash={imetaMap.get(url)?.blurhash} />
      ))}

      {/* Webxdc apps */}
      {webxdcApps.map((app) => (
        <WebxdcEmbed key={app.url} url={app.url} uuid={app.webxdc} name={app.summary} icon={app.thumbnail} />
      ))}
    </>
  );
}

/** Inline video player for kind 1 notes. */
function NoteVideoPlayer({ url, poster, dim, blurhash }: { url: string; poster?: string; dim?: string; blurhash?: string }) {
  return <VideoPlayer src={url} poster={poster} dim={dim} blurhash={blurhash} />;
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

  const { onClick: openPost } = useOpenPost(`/${encodedId}`);

  return (
    <div className="mt-2 space-y-2">
      {/* Stream player / thumbnail */}
      <div className="rounded-xl overflow-hidden border border-border">
        {isLive ? (
          // Inline live player — clicks on the player are intercepted so they don't navigate away
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
          openPost();
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
  const url = useProfileUrl(pubkey, author.data?.metadata);

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 min-w-0">
      <div className="w-11 shrink-0 flex justify-end">
        <RepostIcon className="size-4 text-accent translate-y-px" />
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
  const url = useProfileUrl(pubkey, author.data?.metadata);

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

function DeckHeader({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name || genUserName(pubkey);
  const url = useProfileUrl(pubkey, author.data?.metadata);

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 min-w-0">
      <div className="w-11 shrink-0 flex justify-end">
        <CardsIcon className="size-4 text-primary translate-y-px" />
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
        <span className={cn("shrink-0", author.isLoading && 'ml-1')}>shared a deck</span>
      </div>
    </div>
  );
}

function TreasureHeader({ pubkey, variant }: { pubkey: string; variant: 'hid' | 'found' }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name || genUserName(pubkey);
  const url = useProfileUrl(pubkey, author.data?.metadata);

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

function ThemeHeader({ pubkey, variant }: { pubkey: string; variant: 'shared' | 'updated' }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name || genUserName(pubkey);
  const url = useProfileUrl(pubkey, author.data?.metadata);

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 min-w-0">
      <div className="w-11 shrink-0 flex justify-end">
        <Palette className="size-4 text-primary translate-y-px" />
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
          {variant === 'shared' ? 'shared a theme' : 'updated their theme'}
        </span>
      </div>
    </div>
  );
}


