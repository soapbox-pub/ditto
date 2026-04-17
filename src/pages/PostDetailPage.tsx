import type { NostrEvent } from "@nostrify/nostrify";
import { useNostr } from "@nostrify/react";
import { useQueryClient } from "@tanstack/react-query";
import { useSeoMeta } from "@unhead/react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Radio,
  Package,
  Rocket,
  Share2,
  Star,
  Zap,
} from "lucide-react";
import { nip19 } from "nostr-tools";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
/** Lazy-loaded markdown-heavy components — keeps react-markdown + unified pipeline out of the detail page bundle. */
const ArticleContent = lazy(() => import("@/components/ArticleContent").then(m => ({ default: m.ArticleContent })));
import { BadgeAwardCard } from "@/components/BadgeAwardCard";
import { BadgeDetailContent } from "@/components/BadgeDetailContent";
import { CalendarEventDetailPage } from "@/components/CalendarEventDetailPage";

import {
  ColorMomentContent,
  ColorMomentEyeButton,
} from "@/components/ColorMomentContent";
import {
  EmojifiedText,
  ReactionEmoji,
  RenderResolvedEmoji,
} from "@/components/CustomEmoji";
const BlobbiStateCard = lazy(() => import("@/components/BlobbiStateCard").then(m => ({ default: m.BlobbiStateCard })));
const CustomNipCard = lazy(() => import("@/components/CustomNipCard").then(m => ({ default: m.CustomNipCard })));
import { FileMetadataContent } from "@/components/FileMetadataContent";
import { FollowPackContent } from "@/components/FollowPackContent";
import { FollowPackDetailContent } from "@/components/FollowPackDetailContent";
import { FoundLogContent } from "@/components/FoundLogContent";
import { GeocacheContent } from "@/components/GeocacheContent";
import { GitRepoCard } from "@/components/GitRepoCard";
import { ImageGallery } from "@/components/ImageGallery";
import {
  InteractionsModal,
  type InteractionTab,
} from "@/components/InteractionsModal";
import { RepostIcon } from "@/components/icons/RepostIcon";
import { LiveStreamPage } from "@/components/LiveStreamPage";
import { MagicDeckContent } from "@/components/MagicDeckContent";
import { MusicDetailContent } from "@/components/MusicDetailContent";
import { ActivityCard, EventActionHeader, NoteCard } from "@/components/NoteCard";
import { publishedAtAction } from "@/lib/publishedAtAction";
import { NoteContent } from "@/components/NoteContent";
import { NsiteCard } from "@/components/NsiteCard";
import { NoteMoreMenu } from "@/components/NoteMoreMenu";
import { PostActionBar } from "@/components/PostActionBar";
import { PatchCard } from "@/components/PatchCard";
import { PodcastDetailContent } from "@/components/PodcastDetailContent";
import { PollContent } from "@/components/PollContent";
const PullRequestCard = lazy(() => import("@/components/PullRequestCard").then(m => ({ default: m.PullRequestCard })));
import { ReactionButton } from "@/components/ReactionButton";
import { ReplyComposeModal } from "@/components/ReplyComposeModal";
import { RepostMenu } from "@/components/RepostMenu";
import { ThemeContent } from "@/components/ThemeContent";
import { ThreadedReplyList, FlatThreadedReplyList, type ReplyNode } from "@/components/ThreadedReplyList";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarShape } from "@/lib/avatarShape";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EncryptedMessageContent } from "@/components/EncryptedMessageContent";
import { EncryptedLetterContent } from "@/components/EncryptedLetterContent";
import { VanishEventContent } from "@/components/VanishEventContent";
import { VideoPlayer } from "@/components/VideoPlayer";
import { VoiceMessagePlayer } from "@/components/VoiceMessagePlayer";
import { ProfileCard } from "@/components/ProfileCard";
import { ZapstoreAppContent } from "@/components/ZapstoreAppContent";
import { ZapstoreReleaseContent, ZapstoreReleaseSkeleton, ZapstoreAssetContent, ZapstoreAssetSkeleton } from "@/components/ZapstoreReleaseContent";
import { AppHandlerContent } from "@/components/AppHandlerContent";
import { useAppContext } from "@/hooks/useAppContext";
import { type AddrCoords, useAddrEvent, useEvent } from "@/hooks/useEvent";
import { usePollVoteLabel } from "@/hooks/usePollVoteLabel";
import { formatNumber } from "@/lib/formatNumber";

/** Kinds that get the full follow-pack detail view. */
const FOLLOW_PACK_KINDS = new Set([30000, 39089]);

/** Kind 30311 = NIP-53 Live Activities. */
const LIVE_STREAM_KIND = 30311;

/** Music kinds that get a rich detail view. */
const MUSIC_KINDS = new Set([36787, 34139]);
/** Podcast kinds that get a rich detail view. */
const PODCAST_KINDS = new Set([30054, 30055]);
/** NIP-52 Calendar Events. */
const CALENDAR_EVENT_KINDS = new Set([31922, 31923]);

/** NIP-58 Badge Definition. */
const BADGE_DEFINITION_KIND = 30009;

/** NIP-58 Profile Badges (new replaceable kind). */
const BADGE_PROFILE_KIND_NEW = 10008;

/** NIP-58 Profile Badges (legacy addressable kind). */
const BADGE_PROFILE_KIND_LEGACY = 30008;

/** NIP-58 Badge Award. */
const BADGE_AWARD_KIND = 8;

/** Kind 31985 = Bookstr book reviews. */
const BOOK_REVIEW_KIND = 31985;

/** NIP-62 Request to Vanish. */
const VANISH_KIND = 62;

/** Map a kind number to a human-readable shell title for the loading state. */
function shellTitleForKind(kind?: number): string {
  if (!kind) return "Loading...";
  if (MUSIC_KINDS.has(kind)) return "Track Details";
  if (PODCAST_KINDS.has(kind)) return "Episode Details";
  if (CALENDAR_EVENT_KINDS.has(kind)) return "Event Details";
  if (FOLLOW_PACK_KINDS.has(kind)) return "Follow Pack";
  if (kind === LIVE_STREAM_KIND) return "Live Stream";
  if (kind === 30617) return "Repository";
  if (kind === 1617) return "Patch";
  if (kind === 1618) return "Pull Request";
  if (kind === 30817) return "Custom NIP";
  if (kind === BADGE_DEFINITION_KIND) return "Badge Details";
  if (kind === BADGE_PROFILE_KIND_NEW || kind === BADGE_PROFILE_KIND_LEGACY) return "Badge Collection";
  if (kind === BADGE_AWARD_KIND) return "Badge Award";
  if (kind === BOOK_REVIEW_KIND) return "Book Review";
  if (kind === 32267) return "Zapstore App";
  if (kind === 30063) return "Zapstore Release";
  if (kind === 3063) return "Zapstore Asset";
  if (kind === 31990) return "App";
  if (kind === 15128 || kind === 35128) return "Nsite";
  if (kind === VANISH_KIND) return "Request to Vanish";
  if (kind === 20) return "Photo";
  if (kind === 4) return "Encrypted Message";
  if (kind === 8211) return "Letter";
  if (kind === 6 || kind === 16) return "Repost";
  if (kind === 7) return "Reaction";
  if (kind === 1018) return "Poll Vote";
  if (kind === 9735) return "Zap";
  if (kind === 0) return "Profile";
  if (kind === 31124) return "Blobbi";
  return "Post Details";
}

import { CommentContext } from "@/components/CommentContext";
import { CommunityContent } from "@/components/CommunityContent";
import { ContentWarningGuard } from "@/components/ContentWarningGuard";
import { EmojiPackContent } from "@/components/EmojiPackContent";
import {
  CommunityPreview,
  ExternalContentPreview,
  ProfilePreview,
} from "@/components/ExternalContentHeader";
import { MutedContentGuard } from "@/components/MutedContentGuard";
import { Nip05Badge } from "@/components/Nip05Badge";
import { ProfileHoverCard } from "@/components/ProfileHoverCard";
import { useAuthor } from "@/hooks/useAuthor";
import { useComments } from "@/hooks/useComments";
import { useEventInteractions, extractZapAmount, extractZapSender, extractZapMessage } from "@/hooks/useEventInteractions";
import { useMuteList } from "@/hooks/useMuteList";
import { useProfileUrl } from "@/hooks/useProfileUrl";
import { useReplies } from "@/hooks/useReplies";
import { toast } from "@/hooks/useToast";
import { useEventStats } from "@/hooks/useTrending";
import type { Nip85EventStats } from "@/hooks/useNip85Stats";
import { extractISBNFromEvent } from "@/lib/bookstr";
import { isCustomEmoji, type ResolvedEmoji } from "@/lib/customEmoji";
import { getDisplayName } from "@/lib/getDisplayName";
import { isEventMuted } from "@/lib/muteHelpers";
import { getParentEventId, getParentEventHints, isReplyEvent } from "@/lib/nostrEvents";
import { shareOrCopy } from "@/lib/share";
import { cn } from "@/lib/utils";

interface PostDetailPageProps {
  eventId: string;
  relays?: string[];
  authorHint?: string;
}

interface AddrPostDetailPageProps {
  addr: AddrCoords;
  relays?: string[];
}

/** Get the first value for a tag name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Parse single imeta tag into structured object (for kind 34236 vines). */
function parseImeta(tags: string[][]): {
  url?: string;
  thumbnail?: string;
  dim?: string;
  blurhash?: string;
} {
  const imetaTag = tags.find(([name]) => name === "imeta");
  if (!imetaTag) return {};
  const result: Record<string, string> = {};
  for (let i = 1; i < imetaTag.length; i++) {
    const part = imetaTag[i];
    const spaceIdx = part.indexOf(" ");
    if (spaceIdx === -1) continue;
    const key = part.slice(0, spaceIdx);
    const value = part.slice(spaceIdx + 1);
    if (key === "url") result.url = value;
    else if (key === "image") result.thumbnail = value;
    else if (key === "dim") result.dim = value;
    else if (key === "blurhash") result.blurhash = value;
  }
  return result;
}

/** Formats a timestamp into a full date string like "Feb 16, 2026, 2:53 PM". */
function formatFullDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function PostDetailPage({
  eventId,
  relays,
  authorHint,
}: PostDetailPageProps) {
  const { config } = useAppContext();
  const {
    data: event,
    isLoading,
    isError,
  } = useEvent(eventId, relays, authorHint);
  const [retryEvent, setRetryEvent] = useState<NostrEvent | null>(null);

  useSeoMeta({
    title:
      event || retryEvent
        ? `Post Details - ${config.appName}`
        : `Loading... - ${config.appName}`,
  });

  const resolvedEvent = event || retryEvent;
  const detailTitle = shellTitleForKind(resolvedEvent?.kind);

  if (isLoading) {
    return (
      <PostDetailShell title="Loading...">
        <PostDetailSkeleton />
      </PostDetailShell>
    );
  }

  if (isError || !resolvedEvent) {
    return (
      <PostDetailShell>
        <EventNotFound
          context={{ type: "event", eventId, relays, authorHint }}
          onEventFound={setRetryEvent}
        />
      </PostDetailShell>
    );
  }

  // NIP-58 badge definitions get a detail view with issuer info and awardees
  if (resolvedEvent.kind === BADGE_DEFINITION_KIND) {
    return (
      <PostDetailShell title="Badge Details">
        <MutedContentGuard event={resolvedEvent}>
          <BadgeDetailContent event={resolvedEvent} />
        </MutedContentGuard>
      </PostDetailShell>
    );
  }

  // NIP-58 profile badges get a NoteCard view (same as the feed) + comments
  if (resolvedEvent.kind === BADGE_PROFILE_KIND_NEW || resolvedEvent.kind === BADGE_PROFILE_KIND_LEGACY) {
    return (
      <PostDetailShell title="Badge Collection">
        <MutedContentGuard event={resolvedEvent}>
          <ProfileBadgesDetailView event={resolvedEvent} />
        </MutedContentGuard>
      </PostDetailShell>
    );
  }

  return (
    <PostDetailShell title={detailTitle}>
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

  // We know the kind from the addr before the event loads — use it for the shell title
  const loadingTitle = shellTitleForKind(addr.kind);

  useSeoMeta({
    title: resolvedEvent
      ? `${resolvedEvent.tags.find(([n]) => n === "title")?.[1] || resolvedEvent.tags.find(([n]) => n === "name")?.[1] || loadingTitle} - ${config.appName}`
      : `${loadingTitle} - ${config.appName}`,
  });

  if (isLoading) {
    return (
      <PostDetailShell title={loadingTitle}>
        <PostDetailSkeleton />
      </PostDetailShell>
    );
  }

  if (isError || !resolvedEvent) {
    return (
      <PostDetailShell title={loadingTitle}>
        <EventNotFound
          context={{ type: "addr", addr, relays }}
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

  // Music tracks and playlists get a rich detail view
  if (MUSIC_KINDS.has(resolvedEvent.kind)) {
    return (
      <MutedContentGuard event={resolvedEvent}>
        <MusicDetailContent event={resolvedEvent} />
      </MutedContentGuard>
    );
  }

  // Podcast episodes and trailers get a rich detail view
  if (PODCAST_KINDS.has(resolvedEvent.kind)) {
    return (
      <MutedContentGuard event={resolvedEvent}>
        <PodcastDetailContent event={resolvedEvent} />
      </MutedContentGuard>
    );
  }

  // Calendar events (NIP-52) get a dedicated detail page with RSVP
  if (CALENDAR_EVENT_KINDS.has(resolvedEvent.kind)) {
    return <CalendarEventDetailPage event={resolvedEvent} />;
  }

  // NIP-58 badge definitions get a detail view with issuer info and awardees
  if (resolvedEvent.kind === BADGE_DEFINITION_KIND) {
    return (
      <PostDetailShell title="Badge Details">
        <MutedContentGuard event={resolvedEvent}>
          <BadgeDetailContent event={resolvedEvent} />
        </MutedContentGuard>
      </PostDetailShell>
    );
  }

  // NIP-58 profile badges get a NoteCard view (same as the feed) + comments
  if (resolvedEvent.kind === BADGE_PROFILE_KIND_NEW || resolvedEvent.kind === BADGE_PROFILE_KIND_LEGACY) {
    return (
      <PostDetailShell title="Badge Collection">
        <MutedContentGuard event={resolvedEvent}>
          <ProfileBadgesDetailView event={resolvedEvent} />
        </MutedContentGuard>
      </PostDetailShell>
    );
  }

  return (
    <PostDetailShell title={loadingTitle}>
      <MutedContentGuard event={resolvedEvent}>
        <PostDetailContent event={resolvedEvent} />
      </MutedContentGuard>
    </PostDetailShell>
  );
}

/** NoteCard + NIP-22 comments section for kind 10008/30008 profile badges detail page. */
function ProfileBadgesDetailView({ event }: { event: NostrEvent }) {
  const { muteItems } = useMuteList();
  const { data: commentsData, isLoading: commentsLoading } = useComments(event, 500);

  const orderedReplies = useMemo(() => {
    const topLevel = commentsData?.topLevelComments ?? [];
    const filtered = muteItems.length > 0
      ? topLevel.filter((r) => !isEventMuted(r, muteItems))
      : topLevel;
    return [...filtered]
      .sort((a, b) => a.created_at - b.created_at)
      .map((reply) => {
        const directReplies = commentsData?.getDirectReplies(reply.id) ?? [];
        return {
          reply,
          firstSubReply: directReplies[0] as NostrEvent | undefined,
        };
      });
  }, [commentsData, muteItems]);

  return (
    <div>
      <NoteCard event={event} />
      <div className="pb-16 sidebar:pb-0">
        {commentsLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <ReplyCardSkeleton key={i} />
            ))}
          </div>
        ) : orderedReplies.length > 0 ? (
          <FlatThreadedReplyList replies={orderedReplies} />
        ) : (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No replies yet. Be the first to reply!
          </div>
        )}
      </div>
    </div>
  );
}

export function PostDetailShell({
  children,
  title = "Post Details",
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const navigate = useNavigate();

  return (
    <main className="">
      <div className="flex items-center gap-4 px-4 pt-4 pb-5">
        <button
          onClick={() =>
            window.history.length > 1 ? navigate(-1) : navigate("/")
          }
          className="p-1.5 -ml-1.5 rounded-full hover:bg-secondary/60 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-xl font-bold">{title}</h1>
      </div>

      {children}
    </main>
  );
}

/** Context info about the event that wasn't found. */
type EventNotFoundContext =
  | { type: "event"; eventId: string; relays?: string[]; authorHint?: string }
  | { type: "addr"; addr: AddrCoords; relays?: string[] };

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
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </span>
    </button>
  );
}

/** Inline author preview shown when we have a pubkey hint. */
function AuthorHintRow({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = getDisplayName(metadata, pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  return (
    <div className="flex items-center gap-2.5 pt-1">
      <span className="text-muted-foreground shrink-0 w-14 text-sm">
        Author
      </span>
      <Link to={profileUrl} className="flex items-center gap-2 min-w-0 group">
        {author.isLoading ? (
          <>
            <Skeleton className="size-6 rounded-full shrink-0" />
            <Skeleton className="h-3.5 w-24" />
          </>
        ) : (
          <>
            <Avatar shape={avatarShape} className="size-6 shrink-0">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-medium group-hover:underline truncate">
              {author.data?.event ? (
                <EmojifiedText tags={author.data.event.tags}>
                  {displayName}
                </EmojifiedText>
              ) : (
                displayName
              )}
            </span>
            {metadata?.nip05 && (
              <span className="hidden sm:inline-flex">
                <Nip05Badge
                  nip05={metadata.nip05}
                  pubkey={pubkey}
                  className="text-xs text-muted-foreground"
                  iconSize={12}
                />
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
  const [relayUrl, setRelayUrl] = useState("");
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryOpen, setRetryOpen] = useState(false);

  // Extract author pubkey from context if available
  const authorPubkey =
    context.type === "event" ? context.authorHint : context.addr.pubkey;

  const handleRetry = useCallback(
    async (targetUrl: string) => {
      let url = targetUrl.trim();
      if (!url) return;

      // Auto-prepend wss:// if no protocol is specified
      if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
        url = `wss://${url}`;
        setRelayUrl(url);
      }

      setIsRetrying(true);
      setRetryError(null);

      try {
        const relay = nostr.relay(url);
        const signal = AbortSignal.timeout(8000);

        let filter;
        if (context.type === "event") {
          filter = [{ ids: [context.eventId], limit: 1 }];
        } else {
          filter = [
            {
              kinds: [context.addr.kind],
              authors: [context.addr.pubkey],
              "#d": [context.addr.identifier],
              limit: 1,
            },
          ];
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
    },
    [nostr, context, onEventFound],
  );

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
          {context.type === "event" ? (
            <div className="space-y-1.5">
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0 w-14">ID</span>
                <CopyableHex value={context.eventId} />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0 w-14">
                  Kind
                </span>
                <span className="font-mono text-xs">{context.addr.kind}</span>
              </div>
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0 w-14">
                  Pubkey
                </span>
                <CopyableHex value={context.addr.pubkey} />
              </div>
              {context.addr.identifier && (
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-muted-foreground shrink-0 w-14">
                    d-tag
                  </span>
                  <CopyableHex value={context.addr.identifier} />
                </div>
              )}
            </div>
          )}
          {context.relays && context.relays.length > 0 && (
            <div className="flex items-start gap-2 pt-1">
              <span className="text-muted-foreground shrink-0 w-14">Hints</span>
              <span className="font-mono text-xs break-all">
                {context.relays.join(", ")}
              </span>
            </div>
          )}
          {authorPubkey && <AuthorHintRow pubkey={authorPubkey} />}
        </div>

        {/* Collapsible relay retry */}
        <Collapsible open={retryOpen} onOpenChange={setRetryOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full">
              <ChevronRight
                className={`size-4 transition-transform duration-200 ${retryOpen ? "rotate-90" : ""}`}
              />
              <span>Try another relay</span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-3">
            <div className="flex gap-2">
              <Input
                value={relayUrl}
                onChange={(e) => setRelayUrl(e.target.value)}
                placeholder="wss://relay.example.com"
                className="flex-1 font-mono text-base md:text-xs h-9"
                disabled={isRetrying}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRetry(relayUrl);
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

/** NIP-68 Photo detail content (kind 20). */
function PhotoDetailContent({ event }: { event: NostrEvent }) {
  const photos = useMemo(() => parsePhotoUrls(event.tags), [event.tags]);
  const title = getTag(event.tags, "title");
  const description = event.content;
  const hashtags = event.tags.filter(([n]) => n === "t").map(([, v]) => v);

  // Build imetaMap with blurhash so ImageGallery can show blurhash placeholders
  const imetaMap = useMemo(() => {
    const map = new Map<string, { dim?: string; blurhash?: string }>();
    for (const photo of photos) {
      map.set(photo.url, { blurhash: photo.blurhash });
    }
    return map;
  }, [photos]);

  if (photos.length === 0) return null;

  return (
    <div className="mt-3 space-y-3">
      {title && <p className="text-[15px] font-semibold leading-snug break-words">{title}</p>}
      <ImageGallery
        images={photos.map((p) => p.url)}
        maxVisible={4}
        maxGridHeight="600px"
        imetaMap={imetaMap}
      />
      {description && (
        <p className="text-sm text-muted-foreground leading-relaxed break-words">
          {description}
        </p>
      )}
      {hashtags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
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

/** Parse all imeta image URLs from NIP-68 photo events. */
function parsePhotoUrls(
  tags: string[][],
): Array<{ url: string; alt?: string; blurhash?: string }> {
  const results: Array<{ url: string; alt?: string; blurhash?: string }> = [];
  for (const tag of tags) {
    if (tag[0] !== "imeta") continue;
    const parts: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const p = tag[i];
      const sp = p.indexOf(" ");
      if (sp !== -1) parts[p.slice(0, sp)] = p.slice(sp + 1);
    }
    if (parts.url)
      results.push({
        url: parts.url,
        alt: parts.alt,
        blurhash: parts.blurhash,
      });
  }
  return results;
}

/** Video + title + hashtags for a kind 34236 vine on the detail page. */
function VideoDetailContent({ event }: { event: NostrEvent }) {
  const imeta = useMemo(() => parseImeta(event.tags), [event.tags]);
  const title = getTag(event.tags, "title");
  const hashtags = event.tags.filter(([n]) => n === "t").map(([, v]) => v);
  const duration = getTag(event.tags, "duration");

  return (
    <div className="mt-3">
      {imeta.url && (
        <VideoPlayer
          src={imeta.url}
          poster={imeta.thumbnail}
          dim={imeta.dim}
          blurhash={imeta.blurhash}
          title={title ?? undefined}
        />
      )}
      {title && (
        <p className="text-[15px] font-semibold leading-snug mt-3 break-words">
          {title}
        </p>
      )}
      {event.content && (
        <p className="text-sm text-muted-foreground leading-relaxed mt-1 break-words">
          {event.content}
        </p>
      )}
      {(hashtags.length > 0 || duration) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
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

function VineDetailContent({ event }: { event: NostrEvent }) {
  const imeta = useMemo(() => parseImeta(event.tags), [event.tags]);
  const vineTitle = getTag(event.tags, "title");
  const hashtags = event.tags.filter(([n]) => n === "t").map(([, v]) => v);

  return (
    <div className="mt-3">
      {vineTitle && (
        <p className="text-[15px] leading-relaxed break-words mb-2">
          {vineTitle}
        </p>
      )}
      {imeta.url && (
        <VideoPlayer
          src={imeta.url}
          poster={imeta.thumbnail}
          title={vineTitle ?? undefined}
        />
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

/** Displays star rating for a book review (kind 31985) on the detail page. */
function BookReviewRating({ event }: { event: NostrEvent }) {
  const ratingTag = event.tags.find(([name]) => name === "rating")?.[1];
  if (!ratingTag) return null;

  const fraction = parseFloat(ratingTag);
  if (isNaN(fraction) || fraction < 0 || fraction > 1) return null;

  const starCount = Math.round(fraction * 5);

  return (
    <div className="flex items-center gap-1.5 mt-3">
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          className={cn(
            "size-5",
            i < starCount
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30",
          )}
        />
      ))}
      <span className="text-sm text-muted-foreground ml-1">
        {(fraction * 5).toFixed(1)}
      </span>
    </div>
  );
}


function PostDetailContent({ event }: { event: NostrEvent }) {
  const { muteItems } = useMuteList();
  const queryClient = useQueryClient();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = getDisplayName(metadata, event.pubkey);

  // Refetch the author's profile whenever we navigate to a post by this author.
  useEffect(() => {
    queryClient.refetchQueries({ queryKey: ["author", event.pubkey] });
  }, [event.pubkey, queryClient]);
  const nip05 = metadata?.nip05;
  const profileUrl = useProfileUrl(event.pubkey, metadata);

  // For kind 9735 zap receipts, look up the sender's profile (from P/description tag)
  const zapSenderPubkeyRaw = useMemo(() => event.kind === 9735 ? extractZapSender(event) : '', [event]);
  const zapSenderAuthor = useAuthor(zapSenderPubkeyRaw || undefined);
  const zapSenderMeta = zapSenderAuthor.data?.metadata;
  const zapSenderShape = getAvatarShape(zapSenderMeta);
  const zapSenderDisplayName = getDisplayName(zapSenderMeta, zapSenderPubkeyRaw);
  const zapSenderProfileUrl = useProfileUrl(zapSenderPubkeyRaw, zapSenderMeta);

  const pollVoteLabel = usePollVoteLabel(event);

  // NIP-19 encoded event identifier for share URLs
  const encodedEventId = useMemo(() => {
    if (event.kind >= 30000 && event.kind < 40000) {
      const dTag = event.tags.find(([n]) => n === "d")?.[1];
      if (dTag)
        return nip19.naddrEncode({
          kind: event.kind,
          pubkey: event.pubkey,
          identifier: dTag,
        });
    }
    if (event.kind >= 10000 && event.kind < 20000) {
      return nip19.naddrEncode({
        kind: event.kind,
        pubkey: event.pubkey,
        identifier: "",
      });
    }
    return nip19.neventEncode({ id: event.id, author: event.pubkey });
  }, [event]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/${encodedEventId}`;
    const result = await shareOrCopy(url);
    if (result === "copied") toast({ title: "Link copied to clipboard" });
  }, [encodedEventId]);

  // Kind detection — mirrors NoteCard
  const isVine = event.kind === 34236;
  const isPoll = event.kind === 1068;
  const isPollVote = event.kind === 1018;
  const isGeocache = event.kind === 37516;
  const isFoundLog = event.kind === 7516;
  const isColor = event.kind === 3367;
  const isFollowPack = event.kind === 39089 || event.kind === 30000;
  const isEmojiPack = event.kind === 30030;
  const isArticle = event.kind === 30023;
  const isMagicDeck = event.kind === 37381;
  const isFileMetadata = event.kind === 1063;
  const isTheme = event.kind === 36767 || event.kind === 16767;
  const isVoiceMessage = event.kind === 1222 || event.kind === 1244;
  const isReaction = event.kind === 7;
  const isRepost = event.kind === 6 || event.kind === 16;
  const isPhoto = event.kind === 20;
  const isVideo = event.kind === 21 || event.kind === 22;
  const isCommunity = event.kind === 34550;
  const isGitRepo = event.kind === 30617;
  const isPatch = event.kind === 1617;
  const isPullRequest = event.kind === 1618;
  const isCustomNip = event.kind === 30817;
  const isNsite = event.kind === 15128 || event.kind === 35128;
  const isZapstoreApp = event.kind === 32267;
  const isZapstoreRelease = event.kind === 30063;
  const isZapstoreAsset = event.kind === 3063;
  const isAppHandler = event.kind === 31990;
  const isEncryptedDM = event.kind === 4;
  const isLetter = event.kind === 8211;
  const isVanish = event.kind === VANISH_KIND;
  const isZap = event.kind === 9735;
  const isProfile = event.kind === 0;
  const isBlobbiState = event.kind === 31124;
  const isBadgeAward = event.kind === BADGE_AWARD_KIND;
  const isDevKind = isGitRepo || isPatch || isPullRequest || isCustomNip || isNsite;
  const isTextNote =
    !isVine &&
    !isPoll &&
    !isPollVote &&
    !isGeocache &&
    !isFoundLog &&
    !isColor &&
    !isFollowPack &&
    !isEmojiPack &&
    !isArticle &&
    !isMagicDeck &&
    !isFileMetadata &&
    !isTheme &&
    !isVoiceMessage &&
    !isReaction &&
    !isRepost &&
    !isPhoto &&
    !isVideo &&
    !isCommunity &&
    !isDevKind &&
    !isZapstoreApp &&
    !isZapstoreRelease &&
    !isZapstoreAsset &&
    !isAppHandler &&
    !isEncryptedDM &&
    !isLetter &&
    !isVanish &&
    !isZap &&
    !isProfile &&
    !isBlobbiState &&
    !isBadgeAward;

  const { data: stats } = useEventStats(event.id, event);
  const { data: interactions } = useEventInteractions(event.id);

  // Derive top 3 reaction emojis from actual interaction events (NIP-85 doesn't provide these)
  const topEmojis = useMemo<ResolvedEmoji[]>(() => {
    if (!interactions?.reactions.length) return [];

    const emojiCounts = new Map<
      string,
      { emoji: ResolvedEmoji; count: number }
    >();
    for (const r of interactions.reactions) {
      const key = r.emoji;
      const existing = emojiCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        const resolved: ResolvedEmoji =
          isCustomEmoji(key) && r.emojiUrl
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

  const commentRoot = useMemo<
    NostrEvent | URL | `#${string}` | undefined
  >(() => {
    if (isKind1) return undefined;
    if (!isComment) return event; // non-kind-1 root event — use directly

    // Reconstruct the original root from the comment's uppercase tags
    const K = event.tags.find(([n]) => n === "K")?.[1];
    const P = event.tags.find(([n]) => n === "P")?.[1];
    const A = event.tags.find(([n]) => n === "A")?.[1];
    const E = event.tags.find(([n]) => n === "E")?.[1];
    const I = event.tags.find(([n]) => n === "I")?.[1];

    // External content root (URL or hashtag identifier)
    if (I) {
      if (K === "#") {
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
    const rootPubkey = P ?? "";

    if (A) {
      const parts = A.split(":");
      const dValue = parts.length >= 3 ? parts.slice(2).join(":") : "";
      return {
        id: E ?? "",
        kind: rootKind,
        pubkey: rootPubkey,
        content: "",
        created_at: 0,
        sig: "",
        tags: [["d", dValue]],
      };
    }

    return {
      id: E ?? "",
      kind: rootKind,
      pubkey: rootPubkey,
      content: "",
      created_at: 0,
      sig: "",
      tags: [],
    };
  }, [event, isKind1, isComment]);

  const { data: rawReplies, isLoading: kind1RepliesLoading } = useReplies(
    isKind1 ? event.id : undefined,
  );
  const { data: commentsData, isLoading: commentsLoading } = useComments(
    commentRoot,
    500,
  );

  const repliesLoading = isKind1 ? kind1RepliesLoading : commentsLoading;

  const replies = useMemo(() => {
    const source = isKind1 ? rawReplies : commentsData?.allComments;
    if (!source || muteItems.length === 0) return source;
    return source.filter((r) => !isEventMuted(r, muteItems));
  }, [isKind1, rawReplies, commentsData?.allComments, muteItems]);

  // Build a full reply tree for recursive threaded rendering.
  const replyTree = useMemo((): ReplyNode[] => {
    if (!replies || replies.length === 0) return [];

    if (isKind1) {
      // Kind 1: use NIP-10 parent detection via e-tag markers
      const childrenMap = new Map<string, NostrEvent[]>();
      const directReplies: NostrEvent[] = [];

      for (const r of replies) {
        if (!isReplyEvent(r)) continue;
        const parentId = getParentEventId(r);
        if (!parentId || parentId === event.id) {
          directReplies.push(r);
        } else {
          const siblings = childrenMap.get(parentId) || [];
          siblings.push(r);
          childrenMap.set(parentId, siblings);
        }
      }

      const buildNode = (ev: NostrEvent): ReplyNode => {
        const allChildren = childrenMap.get(ev.id) ?? [];
        if (allChildren.length <= 1) {
          return {
            event: ev,
            children: allChildren.map((c) => buildNode(c)),
          };
        }
        const [first, ...rest] = allChildren;
        return {
          event: ev,
          children: [buildNode(first)],
          hiddenChildren: rest.map((c) => buildNode(c)),
        };
      };
      return directReplies.map((r) => buildNode(r));
    }

    // Kind 1111 or non-kind-1 root: use NIP-22 comment structure
    const buildNode = (ev: NostrEvent): ReplyNode => {
      const allChildren = commentsData?.getDirectReplies(ev.id) ?? [];
      if (allChildren.length <= 1) {
        return {
          event: ev,
          children: allChildren.map((c) => buildNode(c)),
        };
      }
      const [first, ...rest] = allChildren;
      return {
        event: ev,
        children: [buildNode(first)],
        hiddenChildren: rest.map((c) => buildNode(c)),
      };
    };

    if (isComment) {
      const directReplies = commentsData?.getDirectReplies(event.id) ?? [];
      const filtered = muteItems.length > 0
        ? directReplies.filter((r) => !isEventMuted(r, muteItems))
        : directReplies;
      return filtered.map((r) => buildNode(r));
    }

    // Non-kind-1 root
    const topLevel = commentsData?.topLevelComments ?? [];
    const filtered = muteItems.length > 0
      ? topLevel.filter((r) => !isEventMuted(r, muteItems))
      : topLevel;
    return [...filtered].sort((a, b) => a.created_at - b.created_at).map((r) => buildNode(r));
  }, [isKind1, isComment, replies, event.id, commentsData, muteItems]);

  // Seed the NIP-85 stats cache with client-side reply counts for each comment
  // in the thread. NIP-85 may not have stats for kind 1111 events, so this
  // ensures sub-comment counts are visible without extra relay queries.
  const { config } = useAppContext();
  const statsPubkey = config.nip85StatsPubkey;

  useEffect(() => {
    if (!replies || replies.length === 0 || !statsPubkey) return;

    // Count direct replies for each event in the thread
    const replyCounts = new Map<string, number>();
    for (const r of replies) {
      const parentId = isKind1
        ? getParentEventId(r) ?? event.id
        : r.tags.find(([n]) => n === 'e')?.[1];
      if (parentId) {
        replyCounts.set(parentId, (replyCounts.get(parentId) ?? 0) + 1);
      }
    }

    // Seed events whose NIP-85 stats cache is empty or shows 0 comments
    for (const [eventId, count] of replyCounts) {
      const existing = queryClient.getQueryData<Nip85EventStats | null>(['nip85-event-stats', eventId, statsPubkey]);
      if (!existing || existing.commentCount === 0) {
        queryClient.setQueryData<Nip85EventStats | null>(['nip85-event-stats', eventId, statsPubkey], (prev) => ({
          commentCount: Math.max(prev?.commentCount ?? 0, count),
          repostCount: prev?.repostCount ?? 0,
          reactionCount: prev?.reactionCount ?? 0,
          zapCount: prev?.zapCount ?? 0,
          zapAmount: prev?.zapAmount ?? 0,
        }));
      }
    }
  }, [replies, isKind1, event.id, queryClient, statsPubkey]);

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [interactionsOpen, setInteractionsOpen] = useState(false);
  const [interactionsTab, setInteractionsTab] =
    useState<InteractionTab>("reposts");

  const parentHints = useMemo(
    () => (isTextNote || isReaction || isRepost || isZap || isPollVote ? getParentEventHints(event) : undefined),
    [event, isTextNote, isReaction, isRepost, isZap, isPollVote],
  );
  const parentEventId = parentHints?.id;

  // For kind 1111 comments on external content, extract the I tag for the parent preview
  const externalIdentifier = useMemo(() => {
    if (!isComment) return undefined;
    return event.tags.find(([n]) => n === "I")?.[1];
  }, [event, isComment]);

  // For book reviews (kind 31985) and kind 1 posts that tag a book, extract the ISBN
  // so we can show the book context above the post content.
  const bookIsbn = useMemo(() => {
    if (isComment) return undefined; // comments already handled via externalIdentifier
    return extractISBNFromEvent(event);
  }, [event, isComment]);

  // For kind 1111 comments on a profile (kind 0), extract the pubkey for the profile preview
  const profileRootPubkey = useMemo(() => {
    if (!isComment) return undefined;
    const kTag = event.tags.find(([n]) => n === "K")?.[1];
    if (kTag !== "0") return undefined;
    const aTag = event.tags.find(([n]) => n === "A")?.[1];
    if (!aTag) return undefined;
    const parts = aTag.split(":");
    return parts[1] || undefined;
  }, [event, isComment]);

  // For kind 1111 comments on a community (kind 34550), extract the addr for the community preview
  const communityRootAddr = useMemo(() => {
    if (!isComment) return undefined;
    const kTag = event.tags.find(([n]) => n === "K")?.[1];
    if (kTag !== "34550") return undefined;
    const aTag = event.tags.find(([n]) => n === "A")?.[1];
    if (!aTag) return undefined;
    const parts = aTag.split(":");
    const kind = parseInt(parts[0], 10);
    const pubkey = parts[1];
    const identifier = parts.slice(2).join(":");
    if (!pubkey || isNaN(kind)) return undefined;
    return { kind, pubkey, identifier };
  }, [event, isComment]);

  // For kind 1111 comments on any other addressable event (vines, music, etc.),
  // extract the addr for a generic preview — only if not already handled above.
  const addrRoot = useMemo(() => {
    if (
      !isComment ||
      externalIdentifier ||
      profileRootPubkey ||
      communityRootAddr
    )
      return undefined;
    const kTag = event.tags.find(([n]) => n === "K")?.[1];
    if (!kTag) return undefined;
    const kind = parseInt(kTag, 10);
    if (isNaN(kind)) return undefined;
    const aTag = event.tags.find(([n]) => n === "A")?.[1];
    if (!aTag) return undefined;
    const parts = aTag.split(":");
    const pubkey = parts[1];
    const identifier = parts.slice(2).join(":");
    if (!pubkey) return undefined;
    return { kind, pubkey, identifier };
  }, [
    event,
    isComment,
    externalIdentifier,
    profileRootPubkey,
    communityRootAddr,
  ]);

  // Keep the focused post pinned to top while ancestor content loads above it.
  // A ResizeObserver on the ancestor container re-scrolls on every layout shift
  // (image loads, skeleton→content swaps) for the first few seconds.
  const focusedPostRef = useRef<HTMLElement>(null);
  const ancestorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!parentEventId || !focusedPostRef.current) return;

    const post = focusedPostRef.current;
    post.scrollIntoView({ block: "start" });

    // Brief highlight pulse so the user can locate the focused post
    post.style.transition = "background-color 0.3s ease";
    post.style.backgroundColor = "hsl(var(--primary) / 0.06)";
    const pulseTimer = setTimeout(() => {
      post.style.backgroundColor = "";
      // Clean up inline styles after transition completes
      setTimeout(() => {
        post.style.transition = "";
      }, 300);
    }, 1500);

    const ancestor = ancestorRef.current;
    if (!ancestor) return () => clearTimeout(pulseTimer);

    const observer = new ResizeObserver(() => {
      post.scrollIntoView({ block: "start" });
    });
    observer.observe(ancestor);

    // Stop observing after a few seconds — ancestors should be settled by then
    const timer = setTimeout(() => observer.disconnect(), 5000);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(pulseTimer);
    };
  }, [parentEventId]);

  // Extract client from tags
  const clientTag = event.tags.find(([name]) => name === "client");

  // Parse NIP-89 client tag: ["client", name, "kind:pubkey:d-tag", relayHint?]
  const clientNaddr = (() => {
    const addr = clientTag?.[2];
    if (!addr) return null;
    const parts = addr.split(":");
    if (parts.length < 3) return null;
    const [kindStr, pubkey, ...rest] = parts;
    const kind = parseInt(kindStr, 10);
    if (isNaN(kind) || !pubkey) return null;
    const identifier = rest.join(":");
    const relays = clientTag?.[3] ? [clientTag[3]] : undefined;
    try {
      return nip19.naddrEncode({ kind, pubkey, identifier, relays });
    } catch {
      return null;
    }
  })();

  const openInteractions = (tab: InteractionTab) => {
    setInteractionsTab(tab);
    setInteractionsOpen(true);
  };

  const interactionQuoteCount = interactions?.quotes.length ?? 0;
  const quoteCount = interactionQuoteCount || (stats?.quotes ?? 0);
  const repostTotal = (stats?.reposts ?? 0) + (stats?.quotes ?? 0);
  const hasStats = !!(
    stats?.reposts ||
    quoteCount ||
    stats?.reactions ||
    stats?.zapCount
  );

  // Shared stats + date row used by the main post layout and the activity-style
  // detail cards (reactions, reposts, zaps, poll votes). Captures closures over
  // `stats`, `quoteCount`, `topEmojis`, `openInteractions`, `clientTag`,
  // `clientNaddr`, and `event` so it can be dropped into any branch.
  const statsAndDateRow = hasStats ? (
    <div className="flex items-center gap-x-3 py-2 sidebar:py-2.5 mt-2 sidebar:mt-3 text-xs sidebar:text-sm text-muted-foreground">
      {stats?.reposts ? (
        <button
          onClick={() => openInteractions("reposts")}
          className="hover:underline transition-colors"
        >
          <span className="font-bold text-foreground">
            {formatNumber(stats.reposts)}
          </span>{" "}
          Repost{stats.reposts !== 1 ? "s" : ""}
        </button>
      ) : null}
      {quoteCount ? (
        <button
          onClick={() => openInteractions("quotes")}
          className="hover:underline transition-colors"
        >
          <span className="font-bold text-foreground">
            {formatNumber(quoteCount)}
          </span>{" "}
          Quote{quoteCount !== 1 ? "s" : ""}
        </button>
      ) : null}
      {stats?.reactions ? (
        <button
          onClick={() => openInteractions("reactions")}
          className="inline-flex items-center gap-1 hover:[&>span:first-child]:underline transition-colors"
        >
          <span className="font-bold text-foreground">
            {formatNumber(stats.reactions)}
          </span>
          {topEmojis.length > 0 ? (
            <span className="inline-flex items-center">
              {topEmojis.map((emoji, i) => (
                <RenderResolvedEmoji
                  key={i}
                  emoji={emoji}
                  className="h-4 w-4 object-contain leading-none"
                />
              ))}
            </span>
          ) : (
            `Like${stats.reactions !== 1 ? "s" : ""}`
          )}
        </button>
      ) : null}
      {stats?.zapCount ? (
        <button
          onClick={() => openInteractions("zaps")}
          className="hover:underline transition-colors"
        >
          <span className="font-bold text-foreground">
            {formatNumber(stats.zapCount)}
          </span>{" "}
          Zap{stats.zapCount !== 1 ? "s" : ""}
        </button>
      ) : null}
      <span className="ml-auto shrink-0 flex items-center gap-1.5">
        {clientTag?.[1] && (
          <>
            {clientNaddr ? (
              <Link
                to={`/${clientNaddr}`}
                className="hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {clientTag[1]}
              </Link>
            ) : (
              <span>{clientTag[1]}</span>
            )}
            <span>·</span>
          </>
        )}
        <span>{formatFullDate(event.created_at)}</span>
      </span>
    </div>
  ) : (
    <div className="py-2 sidebar:py-2.5 mt-2 sidebar:mt-3 text-xs sidebar:text-sm text-muted-foreground flex items-center gap-1.5">
      {clientTag?.[1] && (
        <>
          {clientNaddr ? (
            <Link
              to={`/${clientNaddr}`}
              className="hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {clientTag[1]}
            </Link>
          ) : (
            <span>{clientTag[1]}</span>
          )}
          <span>·</span>
        </>
      )}
      <span>{formatFullDate(event.created_at)}</span>
    </div>
  );

  return (
    <div>
      {/* Content preview for kind 1111 comments: external content, profile, or community */}
      {externalIdentifier && (
        <ExternalContentPreview identifier={externalIdentifier} />
      )}
      {profileRootPubkey && <ProfilePreview pubkey={profileRootPubkey} />}
      {communityRootAddr && <CommunityPreview addr={communityRootAddr} />}
      {addrRoot && <AddrAncestor addr={addrRoot} />}

      {/* Book context for reviews (kind 31985) and posts that tag a book */}
      {bookIsbn && <ExternalContentPreview identifier={`isbn:${bookIsbn}`} />}

      {/* Ancestor thread chain if this is a reply */}
      {parentEventId && (
        <div ref={ancestorRef}>
          <AncestorThread
            eventId={parentEventId}
            relays={parentHints?.relayHint ? [parentHints.relayHint] : undefined}
            authorHint={parentHints?.authorHint}
            collapseAfter={isReaction || isRepost || isZap || isPollVote ? 0 : undefined}
          />
        </div>
      )}

      {/* Reaction event — compact activity-style card */}
      {isReaction && (
        <article ref={focusedPostRef} className="px-4 pt-3 pb-0">
          <div className="flex items-center gap-3">
            {/* Reaction emoji bubble — size-10 matches the threaded ancestor avatar column */}
            <div className="flex items-center justify-center size-10 rounded-full bg-pink-500/10 shrink-0 text-xl leading-none">
              <ReactionEmoji
                content={event.content}
                tags={event.tags}
                className="h-6 w-6 object-contain"
              />
            </div>

            {/* Author + "reacted" label — single line */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {author.isLoading ? (
                <>
                  <Skeleton className="size-6 rounded-full shrink-0" />
                  <Skeleton className="h-4 w-28" />
                </>
              ) : (
                <>
                  <ProfileHoverCard pubkey={event.pubkey} asChild>
                    <Link to={profileUrl} className="shrink-0">
                      <Avatar shape={avatarShape} className="size-6">
                        <AvatarImage
                          src={metadata?.picture}
                          alt={displayName}
                        />
                        <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                          {displayName[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Link>
                  </ProfileHoverCard>
                  <ProfileHoverCard pubkey={event.pubkey} asChild>
                    <Link
                      to={profileUrl}
                      className="font-bold text-sm hover:underline truncate"
                    >
                      {author.data?.event ? (
                        <EmojifiedText tags={author.data.event.tags}>
                          {displayName}
                        </EmojifiedText>
                      ) : (
                        displayName
                      )}
                    </Link>
                  </ProfileHoverCard>
                  <span className="text-sm text-muted-foreground">reacted</span>
                </>
              )}
            </div>
          </div>

          {/* Stats + date row */}
          {statsAndDateRow}

          <PostActionBar
            event={event}
            onReply={() => setReplyOpen(true)}
            onMore={() => setMoreMenuOpen(true)}
            className="-mx-4 px-4"
          />

          <NoteMoreMenu
            event={event}
            open={moreMenuOpen}
            onOpenChange={setMoreMenuOpen}
          />
          <ReplyComposeModal
            event={event}
            open={replyOpen}
            onOpenChange={setReplyOpen}
          />
          <InteractionsModal
            eventId={event.id}
            open={interactionsOpen}
            onOpenChange={setInteractionsOpen}
            initialTab={interactionsTab}
          />
        </article>
      )}

      {/* Repost event (kind 6 / 16) — compact activity-style card */}
      {isRepost && (
        <article ref={focusedPostRef} className="px-4 pt-3 pb-0">
          <div className="flex items-center gap-3">
            {/* Repost icon bubble — size-10 matches the threaded ancestor avatar column */}
            <div className="flex items-center justify-center size-10 rounded-full bg-accent/10 shrink-0">
              <RepostIcon className="size-5 text-accent" />
            </div>

            {/* Author + "reposted" label — single line */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {author.isLoading ? (
                <>
                  <Skeleton className="size-6 rounded-full shrink-0" />
                  <Skeleton className="h-4 w-28" />
                </>
              ) : (
                <>
                  <ProfileHoverCard pubkey={event.pubkey} asChild>
                    <Link to={profileUrl} className="shrink-0">
                      <Avatar shape={avatarShape} className="size-6">
                        <AvatarImage
                          src={metadata?.picture}
                          alt={displayName}
                        />
                        <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                          {displayName[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Link>
                  </ProfileHoverCard>
                  <ProfileHoverCard pubkey={event.pubkey} asChild>
                    <Link
                      to={profileUrl}
                      className="font-bold text-sm hover:underline truncate"
                    >
                      {author.data?.event ? (
                        <EmojifiedText tags={author.data.event.tags}>
                          {displayName}
                        </EmojifiedText>
                      ) : (
                        displayName
                      )}
                    </Link>
                  </ProfileHoverCard>
                  <span className="text-sm text-muted-foreground">reposted</span>
                </>
              )}
            </div>
          </div>

          {/* Stats + date row */}
          {statsAndDateRow}

          <PostActionBar
            event={event}
            onReply={() => setReplyOpen(true)}
            onMore={() => setMoreMenuOpen(true)}
            className="-mx-4 px-4"
          />

          <NoteMoreMenu
            event={event}
            open={moreMenuOpen}
            onOpenChange={setMoreMenuOpen}
          />
          <ReplyComposeModal
            event={event}
            open={replyOpen}
            onOpenChange={setReplyOpen}
          />
          <InteractionsModal
            eventId={event.id}
            open={interactionsOpen}
            onOpenChange={setInteractionsOpen}
            initialTab={interactionsTab}
          />
        </article>
      )}

      {/* Kind 9735 — Zap receipt: mirrors reaction card layout exactly */}
      {isZap && (() => {
        const zapAmountSats = Math.floor(extractZapAmount(event) / 1000);
        const zapMsg = extractZapMessage(event);
        return (
          <article ref={focusedPostRef} className="px-4 pt-3 pb-0">
            <div className="flex items-center gap-3">
              {/* Zap icon bubble — same size/position as reaction emoji bubble */}
              <div className="flex items-center justify-center size-10 rounded-full bg-amber-500/10 shrink-0">
                <Zap className="size-5 text-amber-500 fill-amber-500" />
              </div>

              {/* Sender + "zapped" + amount — identical structure to reaction row */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {zapSenderAuthor.isLoading ? (
                  <>
                    <Skeleton className="size-6 rounded-full shrink-0" />
                    <Skeleton className="h-4 w-28" />
                  </>
                ) : (
                  <>
                    {zapSenderPubkeyRaw && (
                      <ProfileHoverCard pubkey={zapSenderPubkeyRaw} asChild>
                        <Link to={zapSenderProfileUrl} className="shrink-0">
                          <Avatar shape={zapSenderShape} className="size-6">
                            <AvatarImage src={zapSenderMeta?.picture} alt={zapSenderDisplayName} />
                            <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                              {zapSenderDisplayName[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                      </ProfileHoverCard>
                    )}
                    {zapSenderPubkeyRaw && (
                      <ProfileHoverCard pubkey={zapSenderPubkeyRaw} asChild>
                        <Link to={zapSenderProfileUrl} className="font-bold text-sm hover:underline truncate">
                          {zapSenderAuthor.data?.event ? (
                            <EmojifiedText tags={zapSenderAuthor.data.event.tags}>{zapSenderDisplayName}</EmojifiedText>
                          ) : zapSenderDisplayName}
                        </Link>
                      </ProfileHoverCard>
                    )}
                    <span className="text-sm text-muted-foreground">zapped</span>
                    {zapAmountSats > 0 && (
                      <span className="text-sm font-semibold text-amber-500 shrink-0">
                        {formatNumber(zapAmountSats)} {zapAmountSats === 1 ? 'sat' : 'sats'}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {zapMsg && (
              <p className="text-sm text-muted-foreground italic pl-[52px]">"{zapMsg}"</p>
            )}

            {/* Stats + date row */}
            {statsAndDateRow}

            <PostActionBar
              event={event}
              onReply={() => setReplyOpen(true)}
              onMore={() => setMoreMenuOpen(true)}
              className="-mx-4 px-4"
            />

            <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
            <ReplyComposeModal event={event} open={replyOpen} onOpenChange={setReplyOpen} />
            <InteractionsModal eventId={event.id} open={interactionsOpen} onOpenChange={setInteractionsOpen} initialTab={interactionsTab} />
          </article>
        );
      })()}

      {/* Kind 0 — Profile: show the ProfileCard directly, no action header */}
      {isProfile && (() => {
        let parsedMeta: Record<string, unknown> = {};
        try { parsedMeta = JSON.parse(event.content); } catch { /* ignore */ }
        return (
          <article ref={focusedPostRef} className="px-4 pt-3 pb-0">
            <ProfileCard pubkey={event.pubkey} metadata={parsedMeta} />

            {/* Date row */}
            <div className="py-2 sidebar:py-2.5 mt-3 text-xs sidebar:text-sm text-muted-foreground">
              {formatFullDate(event.created_at)}
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-between py-1 border-t border-b border-border -mx-4 px-4">
              <button
                className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="Reply"
                onClick={() => setReplyOpen(true)}
              >
                <MessageCircle className="size-5" />
                {stats?.replies ? (
                  <span className="text-sm tabular-nums">{formatNumber(stats.replies)}</span>
                ) : null}
              </button>

              <RepostMenu event={event}>
                {(isReposted: boolean) => (
                  <button
                    className={`flex items-center gap-1.5 p-2 rounded-full transition-colors ${isReposted ? "text-accent hover:text-accent/80 hover:bg-accent/10" : "text-muted-foreground hover:text-accent hover:bg-accent/10"}`}
                    title={isReposted ? "Undo repost" : "Repost"}
                  >
                    <RepostIcon className="size-5" />
                    {repostTotal ? (
                      <span className="text-sm tabular-nums">{formatNumber(repostTotal)}</span>
                    ) : null}
                  </button>
                )}
              </RepostMenu>

              <ReactionButton
                eventId={event.id}
                eventPubkey={event.pubkey}
                eventKind={event.kind}
                reactionCount={stats?.reactions}
              />

              <button
                className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors sidebar:hidden"
                title="Share"
                onClick={handleShare}
              >
                <Share2 className="size-5" />
              </button>

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
          </article>
        );
      })()}

      {/* Kind 62 — Request to Vanish: dramatic full-width display, no author row */}
      {isVanish && (
        <article ref={focusedPostRef} className="px-4 pt-3 pb-0">
          <VanishEventContent event={event} />

          {/* Date row */}
          <div className="py-2 sidebar:py-2.5 mt-2 sidebar:mt-3 text-xs sidebar:text-sm text-muted-foreground flex items-center gap-1.5">
            <span>{formatFullDate(event.created_at)}</span>
          </div>

          {/* Action buttons — same as standard post detail */}
          <div className="flex items-center justify-between py-1 border-t border-b border-border -mx-4 px-4">
            <button
              className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Reply"
              onClick={() => setReplyOpen(true)}
            >
              <MessageCircle className="size-5" />
              {stats?.replies ? (
                <span className="text-sm tabular-nums">{formatNumber(stats.replies)}</span>
              ) : null}
            </button>

            <RepostMenu event={event}>
              {(isReposted: boolean) => (
                <button
                  className={`flex items-center gap-1.5 p-2 rounded-full transition-colors ${isReposted ? "text-accent hover:text-accent/80 hover:bg-accent/10" : "text-muted-foreground hover:text-accent hover:bg-accent/10"}`}
                  title={isReposted ? "Undo repost" : "Reposts"}
                >
                  <RepostIcon className="size-5" />
                  {repostTotal ? (
                    <span className="text-sm tabular-nums">{formatNumber(repostTotal)}</span>
                  ) : null}
                </button>
              )}
            </RepostMenu>

            <ReactionButton
              eventId={event.id}
              eventPubkey={event.pubkey}
              eventKind={event.kind}
              reactionCount={stats?.reactions}
            />

            <button
              className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors sidebar:hidden"
              title="Share"
              onClick={handleShare}
            >
              <Share2 className="size-5" />
            </button>

            <button
              className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="More"
              onClick={() => setMoreMenuOpen(true)}
            >
              <MoreHorizontal className="size-5" />
            </button>
          </div>

          <NoteMoreMenu
            event={event}
            open={moreMenuOpen}
            onOpenChange={setMoreMenuOpen}
          />
          <ReplyComposeModal
            event={event}
            open={replyOpen}
            onOpenChange={setReplyOpen}
          />
          <InteractionsModal
            eventId={event.id}
            open={interactionsOpen}
            onOpenChange={setInteractionsOpen}
            initialTab={interactionsTab}
          />
        </article>
      )}

      {/* Kind 1018 — Poll vote: compact activity-style card */}
      {isPollVote && (
        <div ref={focusedPostRef as React.RefObject<HTMLDivElement>}>
          <ActivityCard
            className="border-b-0 pb-0"
            icon={
              <ProfileHoverCard pubkey={event.pubkey} asChild>
                <Link to={profileUrl} className="shrink-0">
                  <Avatar shape={avatarShape} className="size-10">
                    <AvatarImage src={metadata?.picture} alt={displayName} />
                    <AvatarFallback className="bg-primary/20 text-primary text-sm">{displayName[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                </Link>
              </ProfileHoverCard>
            }
            actorRow={
              <div className="flex items-center gap-1.5">
                <ProfileHoverCard pubkey={event.pubkey} asChild>
                  <Link to={profileUrl} className="font-bold text-sm hover:underline truncate">
                    {author.data?.event ? <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText> : displayName}
                  </Link>
                </ProfileHoverCard>
                <span className="text-sm text-muted-foreground shrink-0">voted</span>
              </div>
            }
          >
            {pollVoteLabel && <p className="text-sm font-semibold mt-0.5 truncate">{pollVoteLabel}</p>}
          </ActivityCard>
          <div className="px-4">
            {/* Stats + date row */}
            {statsAndDateRow}
          </div>
          <PostActionBar
            event={event}
            onReply={() => setReplyOpen(true)}
            onMore={() => setMoreMenuOpen(true)}
            className="mx-4"
          />
          <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
          <ReplyComposeModal event={event} open={replyOpen} onOpenChange={setReplyOpen} />
          <InteractionsModal
            eventId={event.id}
            open={interactionsOpen}
            onOpenChange={setInteractionsOpen}
            initialTab={interactionsTab}
          />
        </div>
      )}

      {/* Main post — expanded Ditto-style view */}
      {!isReaction && !isRepost && !isVanish && !isZap && !isProfile && !isPollVote && (
        <article ref={focusedPostRef} className="px-4 pt-3 pb-0">
          {/* Kind action header for app handlers */}
          {isAppHandler && (
            <EventActionHeader pubkey={event.pubkey} icon={Package} action={publishedAtAction(event, { created: "published an app", updated: "updated an app", fallback: "published an app" })} />
          )}
          {isZapstoreApp && (
            <EventActionHeader pubkey={event.pubkey} icon={Package} action={publishedAtAction(event, { created: "published a Zapstore app", updated: "updated a Zapstore app", fallback: "published a Zapstore app" })} />
          )}
          {isZapstoreRelease && (
            <EventActionHeader pubkey={event.pubkey} icon={Package} action={publishedAtAction(event, { created: "published a Zapstore release", updated: "updated a Zapstore release", fallback: "published a Zapstore release" })} />
          )}
          {isZapstoreAsset && (
            <EventActionHeader pubkey={event.pubkey} icon={Package} action="published a Zapstore asset" />
          )}
          {isNsite && (
            <EventActionHeader pubkey={event.pubkey} icon={Rocket} action={publishedAtAction(event, { created: "deployed an", updated: "redeployed an", fallback: "deployed an" })} noun="nsite" nounRoute="/development" />
          )}

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
                    <Avatar shape={avatarShape} className="size-11">
                      <AvatarImage src={metadata?.picture} alt={displayName} />
                      <AvatarFallback className="bg-primary/20 text-primary text-sm">
                        {displayName[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                </ProfileHoverCard>

                <div className="flex-1 min-w-0">
                  <ProfileHoverCard pubkey={event.pubkey} asChild>
                    <Link
                      to={profileUrl}
                      className="font-bold text-[15px] hover:underline block truncate"
                    >
                      {author.data?.event ? (
                        <EmojifiedText tags={author.data.event.tags}>
                          {displayName}
                        </EmojifiedText>
                      ) : (
                        displayName
                      )}
                    </Link>
                  </ProfileHoverCard>
                  {nip05 && (
                    <Nip05Badge
                      nip05={nip05}
                      pubkey={event.pubkey}
                      className="text-sm text-muted-foreground"
                    />
                  )}
                </div>

                {metadata?.bot && (
                  <span className="text-sm text-primary" title="Bot account">
                    🤖
                  </span>
                )}
                {isColor && <ColorMomentEyeButton event={event} />}
              </>
            )}
          </div>

          {/* Comment context for kind 1111 */}
          {event.kind === 1111 && <CommentContext event={event} />}

          {/* Star rating for book reviews (kind 31985) */}
          {event.kind === BOOK_REVIEW_KIND && (
            <BookReviewRating event={event} />
          )}

          {/* Post content — kind-based dispatch, guarded by NIP-36 content-warning */}
          <ContentWarningGuard event={event}>
            {isPhoto ? (
              <PhotoDetailContent event={event} />
            ) : isVideo ? (
              <VideoDetailContent event={event} />
            ) : isArticle ? (
              <Suspense fallback={<Skeleton className="h-32 w-full rounded-lg" />}>
                <ArticleContent event={event} className="mt-3" />
              </Suspense>
            ) : isMagicDeck ? (
              <MagicDeckContent event={event} />
            ) : isFileMetadata ? (
              <FileMetadataContent event={event} />
            ) : isTheme ? (
              <ThemeContent event={event} expanded />
            ) : isVoiceMessage ? (
              <VoiceMessagePlayer event={event} />
            ) : isCommunity ? (
              <CommunityContent event={event} />
            ) : isGitRepo ? (
              <div className="mt-3">
                <GitRepoCard event={event} />
              </div>
            ) : isPatch ? (
              <div className="mt-3">
                <PatchCard event={event} preview={false} />
              </div>
            ) : isPullRequest ? (
              <Suspense fallback={<Skeleton className="h-32 w-full rounded-lg" />}>
                <div className="mt-3">
                  <PullRequestCard event={event} preview={false} />
                </div>
              </Suspense>
            ) : isCustomNip ? (
              <Suspense fallback={<Skeleton className="h-32 w-full rounded-lg" />}>
                <div className="mt-3">
                  <CustomNipCard event={event} preview={false} />
                </div>
              </Suspense>
            ) : isNsite ? (
              <div className="mt-3">
                <NsiteCard event={event} />
              </div>
            ) : isZapstoreApp ? (
              <div className="mt-3 rounded-xl border border-border overflow-hidden px-4 pt-4 pb-4">
                <ZapstoreAppContent event={event} />
              </div>
            ) : isZapstoreRelease ? (
              <div className="mt-3 rounded-xl border border-border overflow-hidden px-4 pt-4 pb-4">
                <Suspense fallback={<ZapstoreReleaseSkeleton />}>
                  <ZapstoreReleaseContent event={event} />
                </Suspense>
              </div>
            ) : isZapstoreAsset ? (
              <div className="mt-3 rounded-xl border border-border overflow-hidden px-4 pt-4 pb-4">
                <Suspense fallback={<ZapstoreAssetSkeleton />}>
                  <ZapstoreAssetContent event={event} />
                </Suspense>
              </div>
            ) : isAppHandler ? (
              <AppHandlerContent event={event} />
            ) : isEncryptedDM ? (
              <EncryptedMessageContent event={event} />
            ) : isLetter ? (
              <EncryptedLetterContent event={event} />
            ) : isBlobbiState ? (
              <Suspense fallback={<Skeleton className="h-24 w-full rounded-lg" />}>
                <BlobbiStateCard event={event} />
              </Suspense>
            ) : isBadgeAward ? (
              <BadgeAwardCard event={event} />
            ) : isVine ||
              isPoll ||
              isGeocache ||
              isFoundLog ||
              isColor ||
              isFollowPack ||
              isEmojiPack ? (
              <>
                {isVine && <VineDetailContent event={event} />}
                {isPoll && <PollContent event={event} />}
                {isGeocache && <GeocacheContent event={event} />}
                {isFoundLog && <FoundLogContent event={event} />}
                {isColor && <ColorMomentContent event={event} />}
                {isFollowPack && <FollowPackContent event={event} />}
                {isEmojiPack && <EmojiPackContent event={event} />}
              </>
            ) : (
              <div className="mt-3">
                <NoteContent
                  event={event}
                  className="text-[15px] leading-relaxed"
                />
              </div>
            )}
          </ContentWarningGuard>

          {/* Stats + date row (shared with activity-style detail cards) */}
          {statsAndDateRow}

          <PostActionBar
            event={event}
            onReply={() => setReplyOpen(true)}
            onMore={() => setMoreMenuOpen(true)}
            className="-mx-4 px-4"
          />

          <NoteMoreMenu
            event={event}
            open={moreMenuOpen}
            onOpenChange={setMoreMenuOpen}
          />
          <ReplyComposeModal
            event={event}
            open={replyOpen}
            onOpenChange={setReplyOpen}
          />
          <InteractionsModal
            eventId={event.id}
            open={interactionsOpen}
            onOpenChange={setInteractionsOpen}
            initialTab={interactionsTab}
          />
        </article>
      )}

      {/* Replies */}
      <div className="pb-16 sidebar:pb-0">
        {repliesLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <ReplyCardSkeleton key={i} />
            ))}
          </div>
        ) : replyTree.length > 0 ? (
          <ThreadedReplyList roots={replyTree} />
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
 * Renders a parent event fetched by addr coordinates as a threaded NoteCard.
 * Used when a kind 1111 comment references its root via an `a` tag (no event ID).
 */
function AddrAncestor({ addr }: { addr: { kind: number; pubkey: string; identifier: string } }) {
  const { data: event, isLoading } = useAddrEvent(addr);

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

  return <NoteCard event={event} threaded />;
}

/**
 * Renders the full ancestor chain above the focused event.
 * Recursively fetches parent -> grandparent -> ... -> root, then renders
 * them top-down with thread connector lines.
 */
function AncestorThread({
  eventId,
  relays,
  authorHint,
  depth = 0,
  collapseAfter,
}: {
  eventId: string;
  relays?: string[];
  authorHint?: string;
  depth?: number;
  collapseAfter?: number;
}) {
  const { data: event, isLoading } = useEvent(eventId, relays, authorHint);
  const [expanded, setExpanded] = useState(false);

  // Determine this ancestor's own parent, including relay and author hints
  const parentHints = useMemo(
    () => (event ? getParentEventHints(event) : undefined),
    [event],
  );
  const parentId = parentHints?.id;

  // Cap recursion to avoid runaway chains
  const MAX_DEPTH = 20;

  // When collapseAfter is set and we've reached the limit, collapse remaining ancestors
  const shouldCollapse =
    collapseAfter !== undefined &&
    depth >= collapseAfter &&
    parentId &&
    !expanded;

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
      {parentId &&
        depth < MAX_DEPTH &&
        (shouldCollapse ? (
          <button
            onClick={() => setExpanded(true)}
            className="flex items-center gap-3 px-4 py-2 w-full hover:bg-secondary/30 transition-colors"
          >
            <div className="flex flex-col items-center w-10">
              <div className="w-0.5 h-2 bg-foreground/20 rounded-full" />
              <div className="size-1.5 rounded-full bg-foreground/30 my-0.5" />
              <div className="size-1.5 rounded-full bg-foreground/20 my-0.5" />
              <div className="size-1.5 rounded-full bg-foreground/10 my-0.5" />
              <div className="w-0.5 h-2 bg-foreground/20 rounded-full" />
            </div>
            <span className="text-sm text-primary font-medium">
              Show earlier posts
            </span>
          </button>
        ) : (
          <AncestorThread
            eventId={parentId}
            relays={parentHints?.relayHint ? [parentHints.relayHint] : undefined}
            authorHint={parentHints?.authorHint}
            depth={depth + 1}
            collapseAfter={collapseAfter}
          />
        ))}
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
