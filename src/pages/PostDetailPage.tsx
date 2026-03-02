import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Zap, MoreHorizontal, Radio, Loader2, AlertCircle, Copy, Check, ChevronRight } from 'lucide-react';
import { RepostIcon } from '@/components/icons/RepostIcon';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { NoteContent } from '@/components/NoteContent';
import { VideoPlayer } from '@/components/VideoPlayer';
import { NoteCard } from '@/components/NoteCard';
import { ThreadedReplyList } from '@/components/ThreadedReplyList';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { ReactionButton } from '@/components/ReactionButton';
import { RepostMenu } from '@/components/RepostMenu';
import { InteractionsModal, type InteractionTab } from '@/components/InteractionsModal';
import { ZapDialog } from '@/components/ZapDialog';
import { RenderResolvedEmoji, EmojifiedText, ReactionEmoji } from '@/components/CustomEmoji';
import { PollContent } from '@/components/PollContent';
import { GeocacheContent } from '@/components/GeocacheContent';
import { FoundLogContent } from '@/components/FoundLogContent';
import { ColorMomentContent, ColorMomentEyeButton } from '@/components/ColorMomentContent';
import { FollowPackContent } from '@/components/FollowPackContent';
import { FollowPackDetailContent } from '@/components/FollowPackDetailContent';
import { ArticleContent } from '@/components/ArticleContent';
import { MagicDeckContent } from '@/components/MagicDeckContent';
import { FileMetadataContent } from '@/components/FileMetadataContent';
import { ThemeContent } from '@/components/ThemeContent';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';
import { LiveStreamPage } from '@/components/LiveStreamPage';
import { WebxdcEmbed } from '@/components/WebxdcEmbed';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { extractAudioUrls } from '@/lib/mediaUrls';
import { useEvent, useAddrEvent, type AddrCoords } from '@/hooks/useEvent';
import { useAppContext } from '@/hooks/useAppContext';

/** Kinds that get the full follow-pack detail view. */
const FOLLOW_PACK_KINDS = new Set([30000, 39089]);

/** Kind 30311 = NIP-53 Live Activities. */
const LIVE_STREAM_KIND = 30311;
import { useReplies } from '@/hooks/useReplies';
import { useComments } from '@/hooks/useComments';
import { CommentContext } from '@/components/CommentContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { useEventStats } from '@/hooks/useTrending';
import { useEventInteractions } from '@/hooks/useEventInteractions';
import { type ResolvedEmoji, isCustomEmoji } from '@/components/CustomEmoji';
import { getDisplayName } from '@/lib/getDisplayName';

import { canZap } from '@/lib/canZap';
import { Nip05Badge } from '@/components/Nip05Badge';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { ContentWarningGuard } from '@/components/ContentWarningGuard';
import { MutedContentGuard } from '@/components/MutedContentGuard';
import { ExternalContentPreview, ProfilePreview } from '@/components/ExternalContentHeader';
import { getParentEventId, isReplyEvent } from '@/lib/nostrEvents';


interface PostDetailPageProps {
  eventId: string;
  relays?: string[];
  authorHint?: string;
}

interface AddrPostDetailPageProps {
  addr: AddrCoords;
  relays?: string[];
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

/** Parsed imeta entry. */
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

/** Parse all imeta tags into a map keyed by URL. */
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

/** Get the first value for a tag name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Parse single imeta tag into structured object (for kind 34236 vines). */
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

/** Formats a timestamp into a full date string like "Feb 16, 2026, 2:53 PM". */
function formatFullDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function PostDetailPage({ eventId, relays, authorHint }: PostDetailPageProps) {
  const { config } = useAppContext();
  const { data: event, isLoading, isError } = useEvent(eventId, relays, authorHint);
  const [retryEvent, setRetryEvent] = useState<NostrEvent | null>(null);

  useSeoMeta({
    title: (event || retryEvent) ? `Post Details - ${config.appName}` : `Loading... - ${config.appName}`,
  });

  if (isLoading) {
    return (
      <PostDetailShell>
        <PostDetailSkeleton />
      </PostDetailShell>
    );
  }

  const resolvedEvent = event || retryEvent;

  if (isError || !resolvedEvent) {
    return (
      <PostDetailShell>
        <EventNotFound
          context={{ type: 'event', eventId, relays, authorHint }}
          onEventFound={setRetryEvent}
        />
      </PostDetailShell>
    );
  }

  return (
    <PostDetailShell>
      <MutedContentGuard event={resolvedEvent}>
        <PostDetailContent event={resolvedEvent} />
      </MutedContentGuard>
    </PostDetailShell>
  );
}

/** Detail page for addressable events (naddr). Same layout as PostDetailPage. */
export function AddrPostDetailPage({ addr, relays }: AddrPostDetailPageProps) {
  const { config } = useAppContext();
  const { data: event, isLoading, isError } = useAddrEvent(addr, relays);
  const [retryEvent, setRetryEvent] = useState<NostrEvent | null>(null);

  const resolvedEvent = event || retryEvent;

  useSeoMeta({
    title: resolvedEvent
      ? `${resolvedEvent.tags.find(([n]) => n === 'title')?.[1] || 'Post Details'} - ${config.appName}`
      : `Loading... - ${config.appName}`,
  });

  if (isLoading) {
    return (
      <PostDetailShell>
        <PostDetailSkeleton />
      </PostDetailShell>
    );
  }

  if (isError || !resolvedEvent) {
    return (
      <PostDetailShell>
        <EventNotFound
          context={{ type: 'addr', addr, relays }}
          onEventFound={setRetryEvent}
        />
      </PostDetailShell>
    );
  }

  // Follow packs get their own full detail view with member list + Follow All
  if (FOLLOW_PACK_KINDS.has(resolvedEvent.kind)) {
    return (
      <PostDetailShell>
        <MutedContentGuard event={resolvedEvent}>
          <FollowPackDetailContent event={resolvedEvent} />
        </MutedContentGuard>
      </PostDetailShell>
    );
  }

  // Live streams (NIP-53) get their own immersive layout with player + chat
  if (resolvedEvent.kind === LIVE_STREAM_KIND) {
    return <LiveStreamPage event={resolvedEvent} />;
  }

  return (
    <PostDetailShell>
      <MutedContentGuard event={resolvedEvent}>
        <PostDetailContent event={resolvedEvent} />
      </MutedContentGuard>
    </PostDetailShell>
  );
}

export function PostDetailShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen">
      {/* Header — matches Ditto: ← Post Details */}
      <div className="flex items-center gap-4 px-4 mt-4 mb-5">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 -ml-1.5 rounded-full hover:bg-secondary/60 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-xl font-bold">Post Details</h1>
      </div>

      {children}
    </main>
  );
}

/** Context info about the event that wasn't found. */
type EventNotFoundContext =
  | { type: 'event'; eventId: string; relays?: string[]; authorHint?: string }
  | { type: 'addr'; addr: AddrCoords; relays?: string[] };

/** Copiable hex value — shows full ID truncated at the end, with a copy button. */
function CopyableHex({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="group flex items-center gap-1.5 min-w-0 text-left"
      title="Click to copy"
    >
      <span className="font-mono text-xs truncate">{value}</span>
      <span className="shrink-0 text-muted-foreground group-hover:text-foreground transition-colors">
        {copied ? (
          <Check className="size-3" />
        ) : (
          <Copy className="size-3" />
        )}
      </span>
    </button>
  );
}

/** Inline author preview shown when we have a pubkey hint. */
function AuthorHintRow({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  return (
    <div className="flex items-center gap-2.5 pt-1">
      <span className="text-muted-foreground shrink-0 w-14 text-sm">Author</span>
      <Link to={profileUrl} className="flex items-center gap-2 min-w-0 group">
        {author.isLoading ? (
          <>
            <Skeleton className="size-6 rounded-full shrink-0" />
            <Skeleton className="h-3.5 w-24" />
          </>
        ) : (
          <>
            <Avatar className="size-6 shrink-0">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-medium group-hover:underline truncate">
              {author.data?.event ? (
                <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
              ) : displayName}
            </span>
            {metadata?.nip05 && (
              <span className="hidden sm:inline-flex">
                <Nip05Badge nip05={metadata.nip05} pubkey={pubkey} className="text-xs text-muted-foreground" iconSize={12} />
              </span>
            )}
          </>
        )}
      </Link>
    </div>
  );
}

/** Shows a "not found" state with contextual event info and a collapsible relay retry option. */
function EventNotFound({
  context,
  onEventFound,
}: {
  context: EventNotFoundContext;
  onEventFound: (event: NostrEvent) => void;
}) {
  const { nostr } = useNostr();
  const [relayUrl, setRelayUrl] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryOpen, setRetryOpen] = useState(false);

  // Extract author pubkey from context if available
  const authorPubkey = context.type === 'event' ? context.authorHint : context.addr.pubkey;

  const handleRetry = useCallback(async (targetUrl: string) => {
    const url = targetUrl.trim();
    if (!url) return;

    if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
      setRetryError('Relay URL must start with wss:// or ws://');
      return;
    }

    setIsRetrying(true);
    setRetryError(null);

    try {
      const relay = nostr.relay(url);
      const signal = AbortSignal.timeout(8000);

      let filter;
      if (context.type === 'event') {
        filter = [{ ids: [context.eventId], limit: 1 }];
      } else {
        filter = [{
          kinds: [context.addr.kind],
          authors: [context.addr.pubkey],
          '#d': [context.addr.identifier],
          limit: 1,
        }];
      }

      const events = await relay.query(filter, { signal });
      if (events.length > 0) {
        onEventFound(events[0]);
      } else {
        setRetryError(`Event not found on ${url}`);
      }
    } catch {
      setRetryError(`Failed to connect to ${url}`);
    } finally {
      setIsRetrying(false);
    }
  }, [nostr, context, onEventFound]);

  return (
    <div className="px-4 py-12">
      <div className="max-w-md mx-auto space-y-6">
        {/* Not found message */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center size-14 rounded-full bg-muted/60 mb-2">
            <AlertCircle className="size-7 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold">Event not found</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {authorPubkey
              ? "This event couldn't be loaded from your connected relays or the author's outbox relays. It may exist on a relay neither of you are connected to."
              : "This event couldn't be loaded from your connected relays. It may exist on a relay you're not connected to."}
          </p>
        </div>

        {/* Context details */}
        <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2 text-sm">
          <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Event details
          </p>
          {context.type === 'event' ? (
            <div className="space-y-1.5">
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0 w-14">ID</span>
                <CopyableHex value={context.eventId} />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0 w-14">Kind</span>
                <span className="font-mono text-xs">{context.addr.kind}</span>
              </div>
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0 w-14">Pubkey</span>
                <CopyableHex value={context.addr.pubkey} />
              </div>
              {context.addr.identifier && (
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-muted-foreground shrink-0 w-14">d-tag</span>
                  <CopyableHex value={context.addr.identifier} />
                </div>
              )}
            </div>
          )}
          {context.relays && context.relays.length > 0 && (
            <div className="flex items-start gap-2 pt-1">
              <span className="text-muted-foreground shrink-0 w-14">Hints</span>
              <span className="font-mono text-xs break-all">{context.relays.join(', ')}</span>
            </div>
          )}
          {authorPubkey && <AuthorHintRow pubkey={authorPubkey} />}
        </div>

        {/* Collapsible relay retry */}
        <Collapsible open={retryOpen} onOpenChange={setRetryOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full">
              <ChevronRight className={`size-4 transition-transform duration-200 ${retryOpen ? 'rotate-90' : ''}`} />
              <span>Try another relay</span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-3">
            <div className="flex gap-2">
              <Input
                value={relayUrl}
                onChange={(e) => setRelayUrl(e.target.value)}
                placeholder="wss://relay.example.com"
                className="flex-1 font-mono text-xs h-9"
                disabled={isRetrying}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRetry(relayUrl);
                }}
              />
              <Button
                size="sm"
                onClick={() => handleRetry(relayUrl)}
                disabled={isRetrying || !relayUrl.trim()}
                className="shrink-0 h-9"
              >
                {isRetrying ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Radio className="size-4" />
                )}
                <span className="ml-1.5">Try</span>
              </Button>
            </div>

            {retryError && (
              <p className="text-xs text-destructive flex items-center gap-1.5">
                <AlertCircle className="size-3 shrink-0" />
                {retryError}
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

/** Video + title + hashtags for a kind 34236 vine on the detail page. */
function VineDetailContent({ event }: { event: NostrEvent }) {
  const imeta = useMemo(() => parseImeta(event.tags), [event.tags]);
  const vineTitle = getTag(event.tags, 'title');
  const hashtags = event.tags.filter(([n]) => n === 't').map(([, v]) => v);

  return (
    <div className="mt-3">
      {vineTitle && (
        <p className="text-[15px] leading-relaxed break-words mb-2">{vineTitle}</p>
      )}
      {imeta.url && (
        <VideoPlayer src={imeta.url} poster={imeta.thumbnail} />
      )}
      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {hashtags.slice(0, 8).map((tag) => (
            <Link
              key={tag}
              to={`/t/${encodeURIComponent(tag)}`}
              className="text-sm text-primary hover:underline"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function PostDetailContent({ event }: { event: NostrEvent }) {
  const { user } = useCurrentUser();
  const { muteItems } = useMuteList();
  const queryClient = useQueryClient();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);

  // Refetch the author's profile whenever we navigate to a post by this author.
  useEffect(() => {
    queryClient.refetchQueries({ queryKey: ['author', event.pubkey] });
  }, [event.pubkey, queryClient]);
  const nip05 = metadata?.nip05;
  const profileUrl = useProfileUrl(event.pubkey, metadata);

    // Kind detection — mirrors NoteCard
    const isVine = event.kind === 34236;
    const isPoll = event.kind === 1068;
    const isGeocache = event.kind === 37516;
    const isFoundLog = event.kind === 7516;
    const isColor = event.kind === 3367;
    const isFollowPack = event.kind === 39089 || event.kind === 30000;
    const isArticle = event.kind === 30023;
    const isMagicDeck = event.kind === 37381;
    const isFileMetadata = event.kind === 1063;
    const isTheme = event.kind === 36767 || event.kind === 16767;
    const isVoiceMessage = event.kind === 1222 || event.kind === 1244;
    const isReaction = event.kind === 7;
    const isTextNote = !isVine && !isPoll && !isGeocache && !isFoundLog && !isColor && !isFollowPack && !isArticle && !isMagicDeck && !isFileMetadata && !isTheme && !isVoiceMessage && !isReaction;

  const videos = useMemo(() => isTextNote ? extractVideos(event.content) : [], [event.content, isTextNote]);
  const imetaMap = useMemo(() => isTextNote ? parseImetaMap(event.tags) : new Map<string, ImetaEntry>(), [event.tags, isTextNote]);
  const audios = useMemo(() => {
    if (!isTextNote) return [];
    const imetaAudios = Array.from(imetaMap.values())
      .filter((e) => e.mime?.startsWith('audio/'))
      .map((e) => e.url);
    if (imetaAudios.length > 0) return imetaAudios;
    return extractAudioUrls(event.content);
  }, [event.content, event.tags, imetaMap, isTextNote]);

  // Extract webxdc attachments from imeta tags
  const webxdcApps = useMemo(() => {
    if (!isTextNote) return [];
    return Array.from(imetaMap.values()).filter(
      (entry) => entry.mime === 'application/x-webxdc' || entry.mime === 'application/vnd.webxdc+zip',
    );
  }, [imetaMap, isTextNote]);

  const { data: stats } = useEventStats(event.id);
  const { data: interactions } = useEventInteractions(event.id);

  // Derive top 3 reaction emojis from actual interaction events (NIP-85 doesn't provide these)
  const topEmojis = useMemo<ResolvedEmoji[]>(() => {
    if (!interactions?.reactions.length) return [];

    const emojiCounts = new Map<string, { emoji: ResolvedEmoji; count: number }>();
    for (const r of interactions.reactions) {
      const key = r.emoji;
      const existing = emojiCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        const resolved: ResolvedEmoji = isCustomEmoji(key) && r.emojiUrl
          ? { content: key, url: r.emojiUrl, name: key.slice(1, -1) }
          : { content: key };
        emojiCounts.set(key, { emoji: resolved, count: 1 });
      }
    }

    return Array.from(emojiCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((e) => e.emoji);
  }, [interactions?.reactions]);

  // Kind 1 events use NIP-10 replies (kind 1); all other events use NIP-22 comments (kind 1111).
  // For kind 1111 events, we reconstruct the original root from uppercase tags so useComments
  // fetches the full comment tree, then extract replies to this specific comment.
  const isKind1 = event.kind === 1;
  const isComment = event.kind === 1111;

  const commentRoot = useMemo<NostrEvent | URL | `#${string}` | undefined>(() => {
    if (isKind1) return undefined;
    if (!isComment) return event; // non-kind-1 root event — use directly

    // Reconstruct the original root from the comment's uppercase tags
    const K = event.tags.find(([n]) => n === 'K')?.[1];
    const P = event.tags.find(([n]) => n === 'P')?.[1];
    const A = event.tags.find(([n]) => n === 'A')?.[1];
    const E = event.tags.find(([n]) => n === 'E')?.[1];
    const I = event.tags.find(([n]) => n === 'I')?.[1];

    // External content root (URL or hashtag identifier)
    if (I) {
      if (K === '#') {
        return I as `#${string}`;
      }
      try {
        return new URL(I);
      } catch {
        // If it's not a valid URL, treat as a hashtag-style identifier
        return I as `#${string}`;
      }
    }

    const rootKind = K ? parseInt(K, 10) : 0;
    const rootPubkey = P ?? '';

    if (A) {
      const parts = A.split(':');
      const dValue = parts.length >= 3 ? parts.slice(2).join(':') : '';
      return {
        id: E ?? '',
        kind: rootKind,
        pubkey: rootPubkey,
        content: '',
        created_at: 0,
        sig: '',
        tags: [['d', dValue]],
      };
    }

    return {
      id: E ?? '',
      kind: rootKind,
      pubkey: rootPubkey,
      content: '',
      created_at: 0,
      sig: '',
      tags: [],
    };
  }, [event, isKind1, isComment]);

  const { data: rawReplies, isLoading: kind1RepliesLoading } = useReplies(isKind1 ? event.id : undefined);
  const { data: commentsData, isLoading: commentsLoading } = useComments(commentRoot, 500);

  const repliesLoading = isKind1 ? kind1RepliesLoading : commentsLoading;

  const replies = useMemo(() => {
    const source = isKind1 ? rawReplies : commentsData?.allComments;
    if (!source || muteItems.length === 0) return source;
    return source.filter((r) => !isEventMuted(r, muteItems));
  }, [isKind1, rawReplies, commentsData?.allComments, muteItems]);

  // Build a reply tree: direct replies each paired with their first sub-reply.
  const orderedReplies = useMemo(() => {
    if (!replies || replies.length === 0) return [];

    if (isKind1) {
      // Kind 1: use NIP-10 parent detection via e-tag markers
      const childrenMap = new Map<string, NostrEvent[]>();
      const directReplies: NostrEvent[] = [];

      for (const r of replies) {
        if (!isReplyEvent(r)) continue; // mention-only e-tags are quotes, not replies
        const parentId = getParentEventId(r);
        if (!parentId || parentId === event.id) {
          directReplies.push(r);
        } else {
          const siblings = childrenMap.get(parentId) || [];
          siblings.push(r);
          childrenMap.set(parentId, siblings);
        }
      }

      return directReplies.map((reply) => ({
        reply,
        firstSubReply: (childrenMap.get(reply.id) ?? [])[0] as NostrEvent | undefined,
      }));
    } else if (isComment) {
      // Kind 1111: we're viewing a comment — show replies to this specific comment
      const directReplies = commentsData?.getDirectReplies(event.id) ?? [];
      const filteredReplies = muteItems.length > 0
        ? directReplies.filter((r) => !isEventMuted(r, muteItems))
        : directReplies;

      return filteredReplies.map((reply) => {
        const subReplies = commentsData?.getDirectReplies(reply.id) ?? [];
        return {
          reply,
          firstSubReply: subReplies[0] as NostrEvent | undefined,
        };
      });
    } else {
      // Non-kind-1 root: use NIP-22 comment structure from useComments
      const topLevel = commentsData?.topLevelComments ?? [];
      const filteredTopLevel = muteItems.length > 0
        ? topLevel.filter((r) => !isEventMuted(r, muteItems))
        : topLevel;

      // Sort oldest-first for threaded conversation view (useComments returns newest-first)
      const sorted = [...filteredTopLevel].sort((a, b) => a.created_at - b.created_at);

      return sorted.map((reply) => {
        const directReplies = commentsData?.getDirectReplies(reply.id) ?? [];
        return {
          reply,
          firstSubReply: directReplies[0] as NostrEvent | undefined,
        };
      });
    }
  }, [isKind1, isComment, replies, event.id, commentsData, muteItems]);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [interactionsOpen, setInteractionsOpen] = useState(false);
  const [interactionsTab, setInteractionsTab] = useState<InteractionTab>('reposts');

  const parentEventId = useMemo(() => isTextNote ? getParentEventId(event) : undefined, [event, isTextNote]);

   // For kind 1111 comments on external content, extract the I tag for the parent preview
  const externalIdentifier = useMemo(() => {
    if (!isComment) return undefined;
    return event.tags.find(([n]) => n === 'I')?.[1];
  }, [event, isComment]);

  // For kind 1111 comments on a profile (kind 0), extract the pubkey for the profile preview
  const profileRootPubkey = useMemo(() => {
    if (!isComment) return undefined;
    const kTag = event.tags.find(([n]) => n === 'K')?.[1];
    if (kTag !== '0') return undefined;
    const aTag = event.tags.find(([n]) => n === 'A')?.[1];
    if (!aTag) return undefined;
    const parts = aTag.split(':');
    return parts[1] || undefined;
  }, [event, isComment]);

  // Keep the focused post pinned to top while ancestor content loads above it.
  // A ResizeObserver on the ancestor container re-scrolls on every layout shift
  // (image loads, skeleton→content swaps) for the first few seconds.
  const focusedPostRef = useRef<HTMLElement>(null);
  const ancestorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!parentEventId || !focusedPostRef.current) return;

    const post = focusedPostRef.current;
    post.scrollIntoView({ block: 'start' });

    // Brief highlight pulse so the user can locate the focused post
    post.style.transition = 'background-color 0.3s ease';
    post.style.backgroundColor = 'hsl(var(--primary) / 0.06)';
    const pulseTimer = setTimeout(() => {
      post.style.backgroundColor = '';
      // Clean up inline styles after transition completes
      setTimeout(() => { post.style.transition = ''; }, 300);
    }, 1500);

    const ancestor = ancestorRef.current;
    if (!ancestor) return () => clearTimeout(pulseTimer);

    const observer = new ResizeObserver(() => {
      post.scrollIntoView({ block: 'start' });
    });
    observer.observe(ancestor);

    // Stop observing after a few seconds — ancestors should be settled by then
    const timer = setTimeout(() => observer.disconnect(), 5000);
    return () => { observer.disconnect(); clearTimeout(timer); clearTimeout(pulseTimer); };
  }, [parentEventId]);

  // Extract client from tags
  const clientTag = event.tags.find(([name]) => name === 'client');

  // Check if the current user can zap this event's author
  const canZapAuthor = user && canZap(metadata);

  const openInteractions = (tab: InteractionTab) => {
    setInteractionsTab(tab);
    setInteractionsOpen(true);
  };

  const repostTotal = (stats?.reposts ?? 0) + (stats?.quotes ?? 0);
  const hasStats = !!(repostTotal || stats?.reactions || stats?.zapCount);

  return (
    <div>
      {/* Content preview for kind 1111 comments: external content or profile */}
      {externalIdentifier && (
        <ExternalContentPreview identifier={externalIdentifier} />
      )}
      {profileRootPubkey && (
        <ProfilePreview pubkey={profileRootPubkey} />
      )}

      {/* Ancestor thread chain if this is a reply */}
      {parentEventId && (
        <div ref={ancestorRef}>
          <AncestorThread eventId={parentEventId} />
        </div>
      )}

      {/* Reaction event — compact activity-style card */}
      {isReaction && (
        <article ref={focusedPostRef} className="px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Avatar with emoji badge overlay */}
            <div className="relative shrink-0">
              {author.isLoading ? (
                <Skeleton className="size-11 rounded-full" />
              ) : (
                <ProfileHoverCard pubkey={event.pubkey} asChild>
                  <Link to={profileUrl}>
                    <Avatar className="size-11">
                      <AvatarImage src={metadata?.picture} alt={displayName} />
                      <AvatarFallback className="bg-primary/20 text-primary text-sm">
                        {displayName[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                </ProfileHoverCard>
              )}
              <div className="absolute -bottom-1 -right-1 flex items-center justify-center size-6 rounded-full bg-pink-500/10 ring-2 ring-background">
                <ReactionEmoji content={event.content} tags={event.tags} className="text-sm leading-none" />
              </div>
            </div>

            {/* Author + "reacted" label + timestamp */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {author.isLoading ? (
                <Skeleton className="h-4 w-28" />
              ) : (
                <ProfileHoverCard pubkey={event.pubkey} asChild>
                  <Link to={profileUrl} className="font-bold text-[15px] hover:underline truncate">
                    {author.data?.event ? (
                      <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
                    ) : displayName}
                  </Link>
                </ProfileHoverCard>
              )}
              <span className="text-sm text-muted-foreground">reacted</span>
              <span className="text-xs text-muted-foreground ml-auto shrink-0">{formatFullDate(event.created_at)}</span>
            </div>
          </div>
        </article>
      )}

      {/* Main post — expanded Ditto-style view */}
      {!isReaction && <article ref={focusedPostRef} className="px-4 pt-3 pb-0">
        {/* Author row */}
        <div className="flex items-center gap-3">
          {author.isLoading ? (
            <>
              <Skeleton className="size-11 rounded-full shrink-0" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-36" />
              </div>
            </>
          ) : (
            <>
              <ProfileHoverCard pubkey={event.pubkey} asChild>
                <Link to={profileUrl}>
                  <Avatar className="size-11">
                    <AvatarImage src={metadata?.picture} alt={displayName} />
                    <AvatarFallback className="bg-primary/20 text-primary text-sm">
                      {displayName[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              </ProfileHoverCard>

              <div className="flex-1 min-w-0">
                <ProfileHoverCard pubkey={event.pubkey} asChild>
                  <Link to={profileUrl} className="font-bold text-[15px] hover:underline block truncate">
                    {author.data?.event ? (
                      <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
                    ) : displayName}
                  </Link>
                </ProfileHoverCard>
                {nip05 && (
                  <Nip05Badge nip05={nip05} pubkey={event.pubkey} className="text-sm text-muted-foreground" />
                )}
              </div>

              {metadata?.bot && (
                <span className="text-sm text-primary" title="Bot account">🤖</span>
              )}
              {isColor && <ColorMomentEyeButton event={event} />}
            </>
          )}
        </div>

        {/* Comment context for kind 1111 */}
        {event.kind === 1111 && <CommentContext event={event} />}

        {/* Post content — kind-based dispatch, guarded by NIP-36 content-warning */}
        <ContentWarningGuard event={event}>
          {isArticle ? (
            <ArticleContent event={event} className="mt-3" />
          ) : isMagicDeck ? (
            <MagicDeckContent event={event} />
          ) : isFileMetadata ? (
            <FileMetadataContent event={event} />
          ) : isTheme ? (
            <ThemeContent event={event} />
          ) : isVoiceMessage ? (
            <VoiceMessagePlayer event={event} />
          ) : isVine || isPoll || isGeocache || isFoundLog || isColor || isFollowPack ? (
            <>
              {isVine && <VineDetailContent event={event} />}
              {isPoll && <PollContent event={event} />}
              {isGeocache && <GeocacheContent event={event} />}
              {isFoundLog && <FoundLogContent event={event} />}
              {isColor && <ColorMomentContent event={event} />}
              {isFollowPack && <FollowPackContent event={event} />}
            </>
          ) : (
            <>
              <div className="mt-3">
                <NoteContent event={event} className="text-[15px] leading-relaxed" />
              </div>
              {videos.map((url, i) => (
                <VideoPlayer key={`v-${i}`} src={url} poster={imetaMap.get(url)?.thumbnail} dim={imetaMap.get(url)?.dim} blurhash={imetaMap.get(url)?.blurhash} />
              ))}
              {audios.map((url, i) => (
                <AudioVisualizer
                  key={`a-${i}`}
                  src={url}
                  mime={imetaMap.get(url)?.mime}
                  avatarUrl={metadata?.picture}
                  avatarFallback={displayName[0]?.toUpperCase() ?? '?'}
                />
              ))}
              {webxdcApps.map((app) => (
                <WebxdcEmbed key={app.url} url={app.url} uuid={app.webxdc} name={app.summary} icon={app.thumbnail} />
              ))}
            </>
          )}
        </ContentWarningGuard>

        {/* Stats row: "2 Reposts 1 👍" left, "Feb 16, 2026, 6:44 PM" right — Ditto style */}
        {hasStats && (
          <div className="flex items-center gap-x-3 py-2 sidebar:py-2.5 mt-2 sidebar:mt-3 text-xs sidebar:text-sm text-muted-foreground">
            {repostTotal ? (
              <button
                onClick={() => openInteractions('reposts')}
                className="hover:underline transition-colors"
              >
                <span className="font-bold text-foreground">{repostTotal}</span>{' '}
                Repost{repostTotal !== 1 ? 's' : ''}
              </button>
            ) : null}
            {stats?.reactions ? (
              <button
                onClick={() => openInteractions('reactions')}
                className="hover:underline transition-colors"
              >
                <span className="font-bold text-foreground">{stats.reactions}</span>{' '}
                {topEmojis.length > 0
                  ? topEmojis.map((emoji, i) => (
                      <RenderResolvedEmoji key={i} emoji={emoji} className="inline-block h-5 w-5 align-text-bottom" />
                    ))
                  : `Like${stats.reactions !== 1 ? 's' : ''}`}
              </button>
            ) : null}
            {stats?.zapCount ? (
              <button
                onClick={() => openInteractions('zaps')}
                className="hover:underline transition-colors"
              >
                <span className="font-bold text-foreground">{stats.zapCount}</span>{' '}
                Zap{stats.zapCount !== 1 ? 's' : ''}
              </button>
            ) : null}
            <span className="ml-auto shrink-0 flex items-center gap-1.5">
              {clientTag?.[1] && (
                <>
                  <span>{clientTag?.[1]}</span>
                  <span>·</span>
                </>
              )}
              <span>{formatFullDate(event.created_at)}</span>
            </span>
          </div>
        )}

        {/* Date-only row if no stats */}
        {!hasStats && (
          <div className="py-2 sidebar:py-2.5 mt-2 sidebar:mt-3 text-xs sidebar:text-sm text-muted-foreground flex items-center gap-1.5">
            {clientTag?.[1] && (
              <>
                <span>{clientTag?.[1]}</span>
                <span>·</span>
              </>
            )}
            <span>{formatFullDate(event.created_at)}</span>
          </div>
        )}

        {/* Action buttons — Ditto style: distributed across full width */}
        <div className="flex items-center justify-between py-1 border-t border-b border-border -mx-4 px-4">
          {/* Reply */}
          <button
            className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            title="Reply"
            onClick={() => setReplyOpen(true)}
          >
            <MessageCircle className="size-5" />
            {stats?.replies ? <span className="text-sm tabular-nums">{stats.replies}</span> : null}
          </button>

          {/* Repost */}
          <RepostMenu event={event}>
            {(isReposted: boolean) => (
              <button
                className={`flex items-center gap-1.5 p-2 rounded-full transition-colors ${isReposted ? 'text-accent hover:text-accent/80 hover:bg-accent/10' : 'text-muted-foreground hover:text-accent hover:bg-accent/10'}`}
                title={isReposted ? 'Undo repost' : 'Reposts'}
              >
                <RepostIcon className="size-5" />
                {repostTotal ? <span className="text-sm tabular-nums">{repostTotal}</span> : null}
              </button>
            )}
          </RepostMenu>

          {/* React */}
          <ReactionButton
            eventId={event.id}
            eventPubkey={event.pubkey}
            eventKind={event.kind}
            reactionCount={stats?.reactions}
          />

          {/* Zap */}
          {canZapAuthor && (
            <ZapDialog target={event}>
              <button
                className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                title="Zaps"
              >
                <Zap className="size-5" />
                {stats?.zapAmount ? <span className="text-sm tabular-nums">{formatSats(stats.zapAmount)}</span> : null}
              </button>
            </ZapDialog>
          )}

          {/* More */}
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
        <InteractionsModal
          eventId={event.id}
          open={interactionsOpen}
          onOpenChange={setInteractionsOpen}
          initialTab={interactionsTab}
        />
      </article>}

      {/* Replies */}
      <div>
        {repliesLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <ReplyCardSkeleton key={i} />
            ))}
          </div>
        ) : orderedReplies.length > 0 ? (
          <ThreadedReplyList replies={orderedReplies} />
        ) : !parentEventId ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No replies yet. Be the first to reply!
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Renders the full ancestor chain above the focused event.
 * Recursively fetches parent -> grandparent -> ... -> root, then renders
 * them top-down with thread connector lines.
 */
function AncestorThread({ eventId, depth = 0 }: { eventId: string; depth?: number }) {
  const { data: event, isLoading } = useEvent(eventId);

  // Determine this ancestor's own parent
  const parentId = useMemo(() => event ? getParentEventId(event) : undefined, [event]);

  // Cap recursion to avoid runaway chains
  const MAX_DEPTH = 20;

  if (isLoading) {
    return (
      <div className="px-4 pt-3 pb-0">
        <div className="flex gap-3">
          <div className="flex flex-col items-center">
            <Skeleton className="size-10 rounded-full shrink-0" />
            <div className="w-0.5 flex-1 mt-2 bg-foreground/20" />
          </div>
          <div className="flex-1 min-w-0 pb-4 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!event) return null;

  return (
    <>
      {/* Render this event's parent first (if any), so ancestors appear top-down */}
      {parentId && depth < MAX_DEPTH && (
        <AncestorThread eventId={parentId} depth={depth + 1} />
      )}
      <NoteCard event={event} threaded />
    </>
  );
}


export function PostDetailSkeleton() {
  return (
    <div>
      <div className="px-4 pt-3 pb-0">
        {/* Author */}
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>

        {/* Content */}
        <div className="mt-3 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>

        {/* Image placeholder */}
        <Skeleton className="mt-3 w-full h-64 rounded-2xl" />

        {/* Date / stats row */}
        <div className="flex items-center gap-3 py-2.5 mt-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-32 ml-auto" />
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between py-2 border-t border-b border-border -mx-4 px-4">
          <Skeleton className="size-[34px] rounded-full" />
          <Skeleton className="size-[34px] rounded-full" />
          <Skeleton className="size-[34px] rounded-full" />
          <Skeleton className="size-[34px] rounded-full" />
          <Skeleton className="size-[34px] rounded-full" />
        </div>
      </div>

      {/* Replies skeleton */}
      <div className="divide-y divide-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <ReplyCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function ReplyCardSkeleton() {
  return (
    <div className="px-4 py-3">
      <div className="flex gap-3">
        <Skeleton className="size-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-6" />
          </div>
          <Skeleton className="h-3 w-24" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="flex gap-12 mt-1">
            <Skeleton className="h-4 w-6" />
            <Skeleton className="h-4 w-6" />
            <Skeleton className="h-4 w-6" />
            <Skeleton className="h-4 w-6" />
          </div>
        </div>
      </div>
    </div>
  );
}
