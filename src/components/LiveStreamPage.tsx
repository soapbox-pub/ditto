import { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, Radio, Zap, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useSeoMeta } from '@unhead/react';

import { useLayoutOptions } from '@/contexts/LayoutContext';
import { PageHeader } from '@/components/PageHeader';
import { LiveStreamPlayer } from '@/components/LiveStreamPlayer';
import { LiveStreamChat } from '@/components/LiveStreamChat';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ZapDialog } from '@/components/ZapDialog';
import { Button } from '@/components/ui/button';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { EmojifiedText } from '@/components/CustomEmoji';
import { Nip05Badge } from '@/components/Nip05Badge';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getDisplayName } from '@/lib/getDisplayName';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { canZap } from '@/lib/canZap';
import { getEffectiveStreamStatus } from '@/lib/streamStatus';
import { cn } from '@/lib/utils';

/** Extract the first value of a tag by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Parse participant entries from p tags. */
interface Participant {
  pubkey: string;
  relay?: string;
  role?: string;
}

function parseParticipants(tags: string[][]): Participant[] {
  return tags
    .filter(([name]) => name === 'p')
    .map(([, pubkey, relay, role]) => ({ pubkey, relay, role }));
}

/** Status badge colors and labels. */
function getStatusConfig(status: string | undefined) {
  switch (status) {
    case 'live':
      return { label: 'LIVE', className: 'bg-red-600 hover:bg-red-600 text-white border-red-600 animate-pulse' };
    case 'ended':
      return { label: 'ENDED', className: 'bg-muted text-muted-foreground border-border' };
    case 'planned':
      return { label: 'PLANNED', className: 'bg-blue-600/90 hover:bg-blue-600/90 text-white border-blue-600' };
    default:
      return { label: status?.toUpperCase() || 'UNKNOWN', className: 'bg-muted text-muted-foreground border-border' };
  }
}

/** Format a unix timestamp to a readable date/time. */
function formatDateTime(timestamp: number): string {
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

interface LiveStreamPageProps {
  event: NostrEvent;
}

export function LiveStreamPage({ event }: LiveStreamPageProps) {
  const { config } = useAppContext();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const [descExpanded, setDescExpanded] = useState(false);

  const title = getTag(event.tags, 'title') || 'Untitled Stream';
  const summary = getTag(event.tags, 'summary');
  const streamUrl = getTag(event.tags, 'streaming');
  const recordingUrl = getTag(event.tags, 'recording');
  const imageUrl = getTag(event.tags, 'image');
  const rawStatus = getTag(event.tags, 'status');
  const status = getEffectiveStreamStatus(event);
  const currentParticipants = getTag(event.tags, 'current_participants');
  const starts = getTag(event.tags, 'starts');
  const hashtags = event.tags.filter(([n]) => n === 't').map(([, v]) => v);
  const participants = useMemo(() => parseParticipants(event.tags), [event.tags]);

  const statusConfig = getStatusConfig(status);
  const hasDescription = !!(summary || hashtags.length > 0 || participants.length > 0);

  // Build the a-tag for live chat: 30311:<pubkey>:<d-tag>
  const dTag = getTag(event.tags, 'd') || '';
  const aTag = `30311:${event.pubkey}:${dTag}`;

  // The URL to play: use the raw status tag (not the staleness heuristic)
  // so that streams marked live always try the streaming URL first.
  const playUrl = rawStatus === 'ended' ? (recordingUrl || streamUrl) : streamUrl;

  useSeoMeta({ title: `${title} - ${config.appName}` });

  // Lock body scroll on mobile to prevent page scrolling past the viewport-locked layout
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)');
    const apply = (matches: boolean) => {
      document.body.style.overflow = matches ? 'hidden' : '';
    };
    apply(mq.matches);
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', handler);
    return () => {
      mq.removeEventListener('change', handler);
      document.body.style.overflow = '';
    };
  }, []);

  const chatSidebar = (
    <aside className="hidden xl:flex xl:flex-col xl:w-[340px] xl:shrink-0 h-screen sticky top-0">
      <LiveStreamChat aTag={aTag} className="h-full" />
    </aside>
  );

  const hasDetails = !!(summary || hashtags.length > 0 || participants.length > 0);
  const hasExpandable = hasDescription || hasDetails;

  useLayoutOptions({ rightSidebar: chatSidebar, noOverscroll: true });

  /** Details block — always visible on desktop, expandable on mobile.
   *  On mobile this also includes the author row.
   */
  const detailsBlock = (
    <div className="space-y-4">
      {/* Author — mobile only (desktop shows it above) */}
      <div className="xl:hidden">
        <StreamAuthorRow event={event} participants={participants} />
      </div>

      {/* Summary */}
      {summary && (
        <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
      )}

      {/* Hashtags */}
      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hashtags.map((tag) => (
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

      {/* Participants list */}
      {participants.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Participants
          </h3>
          <div className="space-y-2">
            {participants.map((p) => (
              <ParticipantRow key={p.pubkey} pubkey={p.pubkey} role={p.role} />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <main className="xl:max-sidebar:flex max-sidebar:flex max-sidebar:flex-col max-sidebar:livestream-height max-sidebar:overflow-hidden">
        {/* Header */}
        <PageHeader
          title="Live Stream"
          onBack={() => window.history.length > 1 ? navigate(-1) : navigate('/')}
          alwaysShowBack
          className="shrink-0 sidebar:sticky sidebar:top-0 z-10 mt-2 mb-2 sidebar:mt-4 sidebar:mb-4"
        >
          <Badge variant="outline" className={cn('ml-auto shrink-0', statusConfig.className)}>
            {status === 'live' && <Radio className="size-3 mr-1" />}
            {statusConfig.label}
          </Badge>
        </PageHeader>

        {/* Video Player */}
        <div className="xl:px-4 shrink-0">
          {playUrl ? (
            <LiveStreamPlayer
              src={playUrl}
              poster={imageUrl}
              className="w-full"
              title={title}
            />
          ) : (
            <div className="aspect-video xl:rounded-2xl bg-muted flex items-center justify-center border-y xl:border border-border">
              <div className="text-center space-y-2">
                <Radio className="size-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground">
                  {status === 'planned' ? 'Stream has not started yet' : 'No stream URL available'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Stream compact info — always visible */}
        <div className="px-4 mt-2 sidebar:mt-4 space-y-2 sidebar:space-y-3 shrink-0">
          {/* Title row with zap button on the right */}
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              <h2 className="text-lg font-bold leading-snug">{title}</h2>
              {/* Meta row */}
              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                {currentParticipants && (
                  <span className="flex items-center gap-1">
                    <Users className="size-3.5" />
                    {currentParticipants} watching
                  </span>
                )}
                {starts && (
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {formatDateTime(parseInt(starts))}
                  </span>
                )}
              </div>
            </div>
            {/* Zap button — right-aligned */}
            {user && <ZapButton event={event} />}
          </div>

          {/* Author / Host — desktop only (on mobile it's inside the expandable details) */}
          <div className="hidden xl:block">
            <StreamAuthorRow event={event} participants={participants} />
          </div>

          {/* Mobile: expandable details toggle */}
          {hasExpandable && (
            <button
              onClick={() => setDescExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors xl:hidden"
            >
              {descExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              {descExpanded ? 'Hide details' : 'Show details'}
            </button>
          )}

          {/* Mobile: collapsible details */}
          {descExpanded && (
            <div className="xl:hidden">
              {detailsBlock}
            </div>
          )}

          {/* Desktop: always show details */}
          <div className="hidden xl:block">
            {detailsBlock}
          </div>
        </div>

        {/* Mobile chat — fills remaining viewport, scrollbox sits above bottom nav */}
        <div className="xl:hidden mt-2 border-t border-border flex-1 min-h-0 overflow-hidden">
          <LiveStreamChat aTag={aTag} className="h-full" />
        </div>

        {/* Bottom spacer (desktop only) */}
        <div className="hidden xl:block h-8" />
      </main>
    </>
  );
}

function StreamAuthorRow({ event, participants }: { event: NostrEvent; participants: Participant[] }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = getDisplayName(metadata, event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);

  // Find the host from participants or default to the event author
  const host = participants.find((p) => p.role?.toLowerCase() === 'host');
  const hostPubkey = host?.pubkey || event.pubkey;

  const hostAuthor = useAuthor(hostPubkey);
  const hostMetadata = hostAuthor.data?.metadata;
  const hostName = getDisplayName(hostMetadata, hostPubkey);
  const hostProfileUrl = useProfileUrl(hostPubkey, hostMetadata);

  // Use the host if different from the event author
  const showPubkey = hostPubkey;
  const showName = hostPubkey === event.pubkey ? displayName : hostName;
  const showMetadata = hostPubkey === event.pubkey ? metadata : hostMetadata;
  const showProfileUrl = hostPubkey === event.pubkey ? profileUrl : hostProfileUrl;
  const showAuthor = hostPubkey === event.pubkey ? author : hostAuthor;

  if (showAuthor.isLoading) {
    return (
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full shrink-0" />
        <div className="space-y-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <ProfileHoverCard pubkey={showPubkey} asChild>
        <Link to={showProfileUrl}>
          <Avatar shape={avatarShape} className="size-10">
            <AvatarImage src={showMetadata?.picture} alt={showName} />
            <AvatarFallback className="bg-primary/20 text-primary text-sm">
              {showName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
      </ProfileHoverCard>
      <div className="min-w-0">
        <ProfileHoverCard pubkey={showPubkey} asChild>
          <Link to={showProfileUrl} className="font-semibold text-sm hover:underline block truncate">
            {showAuthor.data?.event ? (
              <EmojifiedText tags={showAuthor.data.event.tags}>{showName}</EmojifiedText>
            ) : showName}
          </Link>
        </ProfileHoverCard>
        <div className="flex items-center gap-1.5">
          {showMetadata?.nip05 && (
            <Nip05Badge nip05={showMetadata.nip05} pubkey={showPubkey} className="text-xs text-muted-foreground" iconSize={12} />
          )}
          {host && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Host</Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function ZapButton({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;

  if (!canZap(metadata)) return null;

  return (
    <ZapDialog target={event}>
      <Button variant="outline" size="icon" className="shrink-0 size-9 rounded-full text-amber-500 hover:text-amber-400 hover:bg-amber-500/10">
        <Zap className="size-4" />
      </Button>
    </ZapDialog>
  );
}

function ParticipantRow({ pubkey, role }: { pubkey: string; role?: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = getDisplayName(metadata, pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  return (
    <div className="flex items-center gap-2.5">
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link to={profileUrl} className="shrink-0">
          <Avatar shape={avatarShape} className="size-7">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
              {displayName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
      </ProfileHoverCard>
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link to={profileUrl} className="text-sm font-medium hover:underline truncate">
          {author.data?.event ? (
            <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
          ) : displayName}
        </Link>
      </ProfileHoverCard>
      {role && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0 ml-auto">
          {role}
        </Badge>
      )}
    </div>
  );
}
