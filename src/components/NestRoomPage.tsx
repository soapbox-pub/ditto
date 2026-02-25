import { useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic, MicOff, Users, Clock, Hand, LogOut, Share2, XCircle, ArrowUpFromLine, Minimize2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useSeoMeta } from '@unhead/react';
import {
  LiveKitRoom,
  useParticipants,
  useLocalParticipant,
} from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import type { RemoteParticipant, LocalParticipant as LKLocalParticipant } from 'livekit-client';

import { useNostr } from '@nostrify/react';
import { useNestSession } from '@/contexts/NestSessionContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { LiveStreamChat } from '@/components/LiveStreamChat';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNestsApi } from '@/hooks/useNestsApi';
import { useNestRoomInfo } from '@/hooks/useNestRoomInfo';
import { useNestPresencePublisher, useNestPresenceCount } from '@/hooks/useNestPresence';
import { ParticipantPopover } from '@/components/NestParticipantActions';
import { getDisplayName } from '@/lib/getDisplayName';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

/** Nest room kind. */
const NEST_KIND = 30312;

/** Gradient CSS values. */
const NEST_GRADIENTS: Record<string, string> = {
  'gradient-1': 'linear-gradient(90deg, #16a085 0%, #f4d03f 100%)',
  'gradient-2': 'linear-gradient(90deg, #e65c00 0%, #f9d423 100%)',
  'gradient-3': 'linear-gradient(90deg, #3a1c71 0%, #d76d77 50%, #ffaf7b 100%)',
  'gradient-4': 'linear-gradient(90deg, #8584b4 0%, #6969aa 50%, #62629b 100%)',
  'gradient-5': 'linear-gradient(90deg, #00c6fb 0%, #005bea 100%)',
  'gradient-6': 'linear-gradient(90deg, #d558c8 0%, #24d292 100%)',
  'gradient-7': 'linear-gradient(90deg, #d31027 0%, #ea384d 100%)',
  'gradient-8': 'linear-gradient(90deg, #ff512f 0%, #dd2476 100%)',
  'gradient-9': 'linear-gradient(90deg, #6a3093 0%, #a044ff 100%)',
  'gradient-10': 'linear-gradient(90deg, #00b09b 0%, #96c93d 100%)',
  'gradient-11': 'linear-gradient(90deg, #f78ca0 0%, #f9748f 19%, #fd868c 60%)',
};

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

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

interface NestRoomPageProps {
  event: NostrEvent;
}

export function NestRoomPage({ event }: NestRoomPageProps) {
  const navigate = useNavigate();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const session = useNestSession();

  const title = getTag(event.tags, 'title') || 'Untitled Nest';
  const summary = getTag(event.tags, 'summary');
  const status = getTag(event.tags, 'status');
  const color = getTag(event.tags, 'color');
  const imageUrl = getTag(event.tags, 'image');
  const starts = getTag(event.tags, 'starts');
  const dTag = getTag(event.tags, 'd') || '';
  const aTag = `${NEST_KIND}:${event.pubkey}:${dTag}`;
  const statusConfig = getStatusConfig(status);
  const isLive = status === 'live';
  const isOwner = user?.pubkey === event.pubkey;

  // Auto-join the nest via the global session if not already in this room.
  // Also un-minimize when we navigate to the full room view.
  const joinAttempted = useRef(false);
  useEffect(() => {
    if (session.minimized) {
      session.expand(); // un-minimize since we're on the full page now
    }
    if (session.isActive && session.event?.id === event.id) {
      return; // already in this room
    }
    if (joinAttempted.current) return;
    joinAttempted.current = true;
    session.joinNest(event);
  }, [session, event]);

  // The Room instance from the global session (null if not yet connected)
  const room = session.isActive && session.event?.id === event.id ? session.room : null;

  // Room info (admin list, speakers)
  const { data: roomInfo } = useNestRoomInfo(dTag || undefined);
  const adminPubkeys = useMemo(
    () => new Set(roomInfo?.admins ?? (event ? [event.pubkey] : [])),
    [roomInfo, event],
  );
  const isCurrentUserAdmin = !!(user && adminPubkeys.has(user.pubkey));

  // Presence tracking
  const { handRaised, toggleHand, lowerHand } = useNestPresencePublisher(aTag, isLive);
  const { count: presenceCount, handsRaised } = useNestPresenceCount(aTag);

  // Close room handler (owner only) — re-publish event with status "ended"
  const handleCloseRoom = useCallback(async () => {
    if (!user?.signer || !isOwner) return;

    try {
      // Clone tags, update status → ended, add ends timestamp
      const newTags = event.tags.map(([name, ...rest]) =>
        name === 'status' ? ['status', 'ended'] : [name, ...rest],
      );
      if (!newTags.some(([n]) => n === 'ends')) {
        newTags.push(['ends', String(Math.floor(Date.now() / 1000))]);
      }

      const updatedEvent = await user.signer.signEvent({
        kind: NEST_KIND,
        content: event.content,
        tags: newTags,
        created_at: Math.floor(Date.now() / 1000),
      });

      await nostr.event(updatedEvent);
      toast({ title: 'Room closed', description: 'The nest has been ended.' });
      navigate(-1);
    } catch (err) {
      console.error('Failed to close room:', err);
      toast({ title: 'Error', description: 'Could not close the room.', variant: 'destructive' });
    }
  }, [user, isOwner, event, nostr, toast, navigate]);

  // Background style
  const backgroundStyle = useMemo(() => {
    if (imageUrl) {
      return { backgroundImage: `url(${imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    if (color && NEST_GRADIENTS[color]) {
      return { backgroundImage: NEST_GRADIENTS[color] };
    }
    return { backgroundImage: NEST_GRADIENTS['gradient-5'] };
  }, [imageUrl, color]);

  useSeoMeta({ title: `${title} - Ditto` });

  // Lock body scroll on mobile
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

  // Chat sidebar for desktop (reuses LiveStreamChat)
  const chatSidebar = (
    <aside className="hidden xl:flex xl:flex-col xl:w-[340px] xl:shrink-0 border-l border-border h-screen sticky top-0">
      <LiveStreamChat aTag={aTag} className="h-full" />
    </aside>
  );

  useLayoutOptions({ rightSidebar: chatSidebar, noBottomSpacer: true });

  /** Room header card — renders independent of LiveKit context. */
  const headerCard = (
    <div className="px-4 shrink-0">
      <div
        className="relative rounded-2xl px-5 py-6 text-white overflow-hidden"
        style={backgroundStyle}
      >
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className={cn('text-[10px] border-white/30', statusConfig.className)}>
              {status === 'live' && <Mic className="size-3 mr-1" />}
              {statusConfig.label}
            </Badge>
            <div className="flex items-center gap-3 text-sm text-white/90">
              {presenceCount > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="size-3.5" />
                  {presenceCount}
                </span>
              )}
              {starts && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {new Date(parseInt(starts) * 1000).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
          </div>
          <h2 className="text-xl font-bold leading-snug">{title}</h2>
          {summary && <p className="text-sm text-white/80">{summary}</p>}
          <NestHostRow event={event} />
        </div>
      </div>
    </div>
  );

  const handleMinimize = useCallback(() => {
    session.minimize();
    navigate(-1);
  }, [session, navigate]);

  const handleLeave = useCallback(() => {
    session.leaveNest();
    navigate(-1);
  }, [session, navigate]);

  const isConnected = room !== null && session.connectionState === ConnectionState.Connected;

  return (
    <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border xl:min-h-screen max-sidebar:flex max-sidebar:flex-col max-sidebar:h-[calc(100dvh-6.5rem)] max-sidebar:max-h-[calc(100dvh-6.5rem)] max-sidebar:overflow-hidden">
      {/* Header */}
      <div className="shrink-0 sidebar:sticky sidebar:top-0 z-10 flex items-center gap-4 px-4 mt-4 mb-4 bg-background/80 backdrop-blur-md">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 -ml-1.5 rounded-full hover:bg-secondary/60 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-xl font-bold truncate">Nest</h1>
        <Badge variant="outline" className={cn('ml-auto shrink-0', statusConfig.className)}>
          {status === 'live' && <Mic className="size-3 mr-1" />}
          {statusConfig.label}
        </Badge>
      </div>

      {/* Connected: use the global session Room for LiveKit hooks */}
      {isConnected ? (
        <LiveKitRoom
          room={room!}
          serverUrl=""
          token=""
          audio={false}
          video={false}
        >
          {headerCard}

          {/* Participants (uses LiveKit hooks) */}
          <div className="px-4 mt-4 shrink-0">
            <NestParticipantsGrid
              event={event}
              lowerHand={lowerHand}
              handsRaised={handsRaised}
              roomId={dTag}
              adminPubkeys={adminPubkeys}
              isCurrentUserAdmin={isCurrentUserAdmin}
            />
          </div>

          {/* Controls (uses LiveKit hooks) */}
          <div className="px-4 mt-4 shrink-0">
            <NestControlBar
              event={event}
              handRaised={handRaised}
              onToggleHand={toggleHand}
              onLeave={handleLeave}
              onMinimize={handleMinimize}
              isOwner={isOwner}
              onCloseRoom={handleCloseRoom}
            />
          </div>

          {/* Mobile chat */}
          <div className="xl:hidden mt-4 border-t border-border flex-1 min-h-0">
            <LiveStreamChat aTag={aTag} className="h-full" />
          </div>
          <div className="hidden xl:block h-8" />
        </LiveKitRoom>
      ) : (
        <>
          {headerCard}

          {/* Not yet connected — show empty participants */}
          <div className="px-4 mt-4 shrink-0">
            <NestParticipantsEmpty />
          </div>

          {/* Controls without LiveKit (only leave + hand + share) */}
          <div className="px-4 mt-4 shrink-0">
            <NestControlBarSimple
              handRaised={handRaised}
              onToggleHand={toggleHand}
              onLeave={() => navigate(-1)}
              isOwner={isOwner}
              onCloseRoom={handleCloseRoom}
            />
          </div>

          {/* Mobile chat */}
          <div className="xl:hidden mt-4 border-t border-border flex-1 min-h-0">
            <LiveStreamChat aTag={aTag} className="h-full" />
          </div>
          <div className="hidden xl:block h-8" />
        </>
      )}
    </main>
  );
}

/** Host info row displayed inside the gradient header. */
function NestHostRow({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);

  if (author.isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <ProfileHoverCard pubkey={event.pubkey} asChild>
        <a href={profileUrl} onClick={(e) => e.stopPropagation()}>
          <Avatar className="size-8 border-2 border-white/30">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-white/20 text-white text-xs">
              {displayName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </a>
      </ProfileHoverCard>
      <div className="min-w-0">
        <span className="text-sm font-semibold text-white">
          {author.data?.event ? (
            <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
          ) : displayName}
        </span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-2 bg-white/20 text-white border-0">
          Host
        </Badge>
      </div>
    </div>
  );
}

/**
 * Grid of participants from LiveKit, split into speakers and audience.
 * Must be rendered inside a <LiveKitRoom> context.
 */
function NestParticipantsGrid({
  event,
  lowerHand,
  handsRaised,
  roomId,
  adminPubkeys,
  isCurrentUserAdmin,
}: {
  event: NostrEvent;
  lowerHand: () => void;
  handsRaised: Set<string>;
  roomId: string;
  adminPubkeys: Set<string>;
  isCurrentUserAdmin: boolean;
}) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  const speakers = participants.filter((p) => p.permissions?.canPublish);
  const audience = participants.filter((p) => !p.permissions?.canPublish);

  // Auto-lower hand when promoted to speaker
  const wasOnStage = useRef(false);
  useEffect(() => {
    const onStage = localParticipant?.permissions?.canPublish ?? false;
    if (onStage && !wasOnStage.current) {
      lowerHand();
      // Auto-enable mic when promoted
      localParticipant?.setMicrophoneEnabled(true).catch(() => {});
    }
    wasOnStage.current = onStage;
  }, [localParticipant, localParticipant?.permissions?.canPublish, lowerHand]);

  if (participants.length === 0) {
    return (
      <div className="text-center py-8">
        <Users className="size-6 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No participants yet. Be the first to join!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Speakers / Stage */}
      {speakers.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            On Stage
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
            {speakers.map((p) => (
              <ParticipantTile
                key={p.identity}
                participant={p}
                hostPubkey={event.pubkey}
                handRaised={handsRaised.has(p.identity)}
                roomId={roomId}
                adminPubkeys={adminPubkeys}
                isCurrentUserAdmin={isCurrentUserAdmin}
              />
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      {speakers.length > 0 && audience.length > 0 && (
        <div className="border-t border-border" />
      )}

      {/* Audience */}
      {audience.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Listeners
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
            {audience.map((p) => (
              <ParticipantTile
                key={p.identity}
                participant={p}
                hostPubkey={event.pubkey}
                handRaised={handsRaised.has(p.identity)}
                roomId={roomId}
                adminPubkeys={adminPubkeys}
                isCurrentUserAdmin={isCurrentUserAdmin}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Fallback participants display when not connected to LiveKit. */
function NestParticipantsEmpty() {
  return (
    <div className="text-center py-8">
      <Users className="size-6 text-muted-foreground/40 mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">
        No participants yet. Be the first to join!
      </p>
    </div>
  );
}

/** Single participant tile with avatar, name, mic indicator, hand-raised badge, and tap-to-open popover. */
function ParticipantTile({
  participant,
  hostPubkey,
  handRaised,
  roomId,
  adminPubkeys,
  isCurrentUserAdmin,
}: {
  participant: RemoteParticipant | LKLocalParticipant;
  hostPubkey: string;
  handRaised: boolean;
  roomId: string;
  adminPubkeys: Set<string>;
  isCurrentUserAdmin: boolean;
}) {
  const pubkey = participant.identity;
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey);
  const isHost = pubkey === hostPubkey;
  const isSpeaker = participant.permissions?.canPublish;
  const isMicEnabled = participant.isMicrophoneEnabled;

  return (
    <ParticipantPopover
      participant={participant}
      hostPubkey={hostPubkey}
      roomId={roomId}
      adminPubkeys={adminPubkeys}
      isCurrentUserAdmin={isCurrentUserAdmin}
    >
      <button
        type="button"
        className="flex flex-col items-center text-center gap-1.5 cursor-pointer outline-none"
      >
        <div className="relative">
          <Avatar className={cn(
            'size-16 border-2 transition-all',
            isSpeaker && isMicEnabled
              ? 'border-primary ring-2 ring-primary/30'
              : 'border-border',
          )}>
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary">
              {displayName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>

          {/* Mic indicator for speakers */}
          {isSpeaker && (
            <div className={cn(
              'absolute -bottom-1 -right-1 size-6 rounded-full flex items-center justify-center border-2 border-background',
              isMicEnabled ? 'bg-primary text-primary-foreground' : 'bg-destructive text-destructive-foreground',
            )}>
              {isMicEnabled ? <Mic className="size-3" /> : <MicOff className="size-3" />}
            </div>
          )}

          {/* Hand-raised indicator */}
          {handRaised && (
            <div className="absolute -top-1 -left-1 size-6 rounded-full flex items-center justify-center border-2 border-background bg-amber-500 text-white animate-bounce">
              <Hand className="size-3" />
            </div>
          )}
        </div>

        <div className="min-w-0 w-full">
          <p className="text-xs font-medium truncate">{displayName}</p>
          {isHost && (
            <span className="text-[10px] text-primary font-semibold">Host</span>
          )}
          {!isHost && isSpeaker && (
            <span className="text-[10px] text-muted-foreground">Speaker</span>
          )}
        </div>
      </button>
    </ParticipantPopover>
  );
}

/** Bottom control bar with mic toggle, hand raise, minimize, and leave. Must be inside LiveKitRoom. */
function NestControlBar({
  event,
  handRaised,
  onToggleHand,
  onLeave,
  onMinimize,
  isOwner,
  onCloseRoom,
}: {
  event: NostrEvent;
  handRaised: boolean;
  onToggleHand: () => void;
  onLeave: () => void;
  onMinimize: () => void;
  isOwner: boolean;
  onCloseRoom: () => void;
}) {
  const { user } = useCurrentUser();
  const api = useNestsApi();
  const { toast } = useToast();
  const dTag = getTag(event.tags, 'd') || '';

  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const isOnStage = localParticipant?.permissions?.canPublish ?? false;

  const handleMicToggle = useCallback(async () => {
    if (!localParticipant) return;
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (err) {
      console.error('Failed to toggle mic:', err);
      toast({ title: 'Error', description: 'Could not toggle microphone.', variant: 'destructive' });
    }
  }, [localParticipant, isMicrophoneEnabled, toast]);

  const handleLeaveStage = useCallback(async () => {
    if (!user || !dTag) return;
    try {
      await api.updatePermissions(dTag, user.pubkey, { can_publish: false });
    } catch (err) {
      console.error('Failed to leave stage:', err);
    }
  }, [api, dTag, user]);

  /** Owner self-promotes back to stage via the API. */
  const handleGoOnStage = useCallback(async () => {
    if (!user || !dTag) return;
    try {
      await api.updatePermissions(dTag, user.pubkey, { can_publish: true });
    } catch (err) {
      console.error('Failed to go on stage:', err);
      toast({ title: 'Error', description: 'Could not join the stage.', variant: 'destructive' });
    }
  }, [api, dTag, user, toast]);

  const handleShare = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: 'Link copied', description: 'Room link copied to clipboard.' });
    });
  }, [toast]);

  return (
    <div className="flex items-center justify-center gap-3 py-3">
      <TooltipProvider>
        {/* Leave / Leave Stage button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isOnStage ? 'outline' : 'destructive'}
              size="icon"
              className="rounded-full size-12"
              onClick={isOnStage ? handleLeaveStage : onLeave}
            >
              <LogOut className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isOnStage ? 'Leave Stage' : 'Leave Room'}
          </TooltipContent>
        </Tooltip>

        {/* Hand raise (non-owners who are off stage) */}
        {user && !isOnStage && !isOwner && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={handRaised ? 'default' : 'outline'}
                size="icon"
                className={cn('rounded-full size-12', handRaised && 'bg-primary')}
                onClick={onToggleHand}
              >
                <Hand className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {handRaised ? 'Lower Hand' : 'Raise Hand'}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Go on Stage (owner who is off stage) */}
        {isOwner && !isOnStage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full size-12"
                onClick={handleGoOnStage}
              >
                <ArrowUpFromLine className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Go on Stage</TooltipContent>
          </Tooltip>
        )}

        {/* Mic toggle (only on stage) */}
        {isOnStage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isMicrophoneEnabled ? 'default' : 'outline'}
                size="icon"
                className={cn(
                  'rounded-full size-12',
                  isMicrophoneEnabled
                    ? 'bg-primary hover:bg-primary/90'
                    : 'bg-destructive/10 text-destructive hover:bg-destructive/20',
                )}
                onClick={handleMicToggle}
              >
                {isMicrophoneEnabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isMicrophoneEnabled ? 'Mute' : 'Unmute'}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Share */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full size-12"
              onClick={handleShare}
            >
              <Share2 className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Share</TooltipContent>
        </Tooltip>

        {/* Minimize */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full size-12"
              onClick={onMinimize}
            >
              <Minimize2 className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Minimize</TooltipContent>
        </Tooltip>

        {/* Close Room (owner only) */}
        {isOwner && (
          <CloseRoomButton onCloseRoom={onCloseRoom} />
        )}
      </TooltipProvider>
    </div>
  );
}

/** Simplified control bar when not connected to LiveKit (no mic toggle, no stage). */
function NestControlBarSimple({
  handRaised,
  onToggleHand,
  onLeave,
  isOwner,
  onCloseRoom,
}: {
  handRaised: boolean;
  onToggleHand: () => void;
  onLeave: () => void;
  isOwner: boolean;
  onCloseRoom: () => void;
}) {
  const { user } = useCurrentUser();
  const { toast } = useToast();

  const handleShare = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: 'Link copied', description: 'Room link copied to clipboard.' });
    });
  }, [toast]);

  return (
    <div className="flex items-center justify-center gap-3 py-3">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="destructive"
              size="icon"
              className="rounded-full size-12"
              onClick={onLeave}
            >
              <LogOut className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Leave Room</TooltipContent>
        </Tooltip>

        {user && !isOwner && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={handRaised ? 'default' : 'outline'}
                size="icon"
                className={cn('rounded-full size-12', handRaised && 'bg-primary')}
                onClick={onToggleHand}
              >
                <Hand className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {handRaised ? 'Lower Hand' : 'Raise Hand'}
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full size-12"
              onClick={handleShare}
            >
              <Share2 className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Share</TooltipContent>
        </Tooltip>

        {isOwner && (
          <CloseRoomButton onCloseRoom={onCloseRoom} />
        )}
      </TooltipProvider>
    </div>
  );
}

/** Close Room button with confirmation dialog. */
function CloseRoomButton({ onCloseRoom }: { onCloseRoom: () => void }) {
  return (
    <AlertDialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full size-12 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <XCircle className="size-5" />
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Close Room</TooltipContent>
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close this nest?</AlertDialogTitle>
          <AlertDialogDescription>
            This will end the room for all participants. Everyone currently listening or speaking will be disconnected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onCloseRoom}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Close Room
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
