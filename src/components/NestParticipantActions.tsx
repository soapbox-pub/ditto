import { useState, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, UserPlus, UserMinus, MicOff, ArrowUpFromLine, ArrowDownFromLine, ShieldPlus, ShieldMinus, VolumeX, ExternalLink } from 'lucide-react';
import type { RemoteParticipant, LocalParticipant as LKLocalParticipant } from 'livekit-client';

import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ZapDialog } from '@/components/ZapDialog';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList, useFollowActions } from '@/hooks/useFollowActions';
import { useMuteList } from '@/hooks/useMuteList';
import { useNestsApi } from '@/hooks/useNestsApi';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useToast } from '@/hooks/useToast';
import { getDisplayName } from '@/lib/getDisplayName';
import { canZap } from '@/lib/canZap';
import { cn } from '@/lib/utils';

interface ParticipantPopoverProps {
  /** The popover trigger (the participant tile content). */
  children: ReactNode;
  participant: RemoteParticipant | LKLocalParticipant;
  hostPubkey: string;
  roomId: string;
  adminPubkeys: Set<string>;
  isCurrentUserAdmin: boolean;
}

/**
 * A compact floating popover menu anchored to a participant's avatar.
 * Wraps its children as the trigger element.
 */
export function ParticipantPopover({
  children,
  participant,
  hostPubkey,
  roomId,
  adminPubkeys,
  isCurrentUserAdmin,
}: ParticipantPopoverProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const api = useNestsApi();
  const { toast } = useToast();

  const pubkey = participant.identity;
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const authorEvent = author.data?.event;
  const displayName = getDisplayName(metadata, pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  const { data: followData } = useFollowList();
  const { follow, unfollow, isPending: followPending } = useFollowActions();
  const { addMute, removeMute, isMuted } = useMuteList();

  const isSelf = user?.pubkey === pubkey;
  const isHost = pubkey === hostPubkey;
  const isTargetAdmin = adminPubkeys.has(pubkey);
  const isSpeaker = participant.permissions?.canPublish ?? false;
  const isMicEnabled = participant.isMicrophoneEnabled;
  const isFollowed = followData?.pubkeys.includes(pubkey) ?? false;
  const isUserMuted = isMuted('pubkey', pubkey);
  const canZapUser = !isSelf && canZap(metadata);

  const [actionPending, setActionPending] = useState(false);

  const runAction = useCallback(async (label: string, fn: () => Promise<void>) => {
    setActionPending(true);
    try {
      await fn();
      setOpen(false);
    } catch (err) {
      console.error(`Failed to ${label}:`, err);
      toast({ title: 'Error', description: `Could not ${label}.`, variant: 'destructive' });
    } finally {
      setActionPending(false);
    }
  }, [toast]);

  const handlePromote = () =>
    runAction('promote to stage', () => api.updatePermissions(roomId, pubkey, { can_publish: true }));
  const handleDemote = () =>
    runAction('remove from stage', () => api.updatePermissions(roomId, pubkey, { can_publish: false }));
  const handleMuteMic = () =>
    runAction('mute microphone', () => api.updatePermissions(roomId, pubkey, { mute_microphone: true }));
  const handleMakeAdmin = () =>
    runAction('make moderator', () => api.updatePermissions(roomId, pubkey, { is_admin: true }));
  const handleRemoveAdmin = () =>
    runAction('remove moderator', () => api.updatePermissions(roomId, pubkey, { is_admin: false }));

  const handleFollow = async () => {
    try {
      if (isFollowed) {
        await unfollow(pubkey);
        toast({ title: `Unfollowed ${displayName}` });
      } else {
        await follow(pubkey);
        toast({ title: `Following ${displayName}` });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update follow list.', variant: 'destructive' });
    }
  };

  const handleMuteUser = () => {
    const muteItem = { type: 'pubkey' as const, value: pubkey };
    const mutation = isUserMuted ? removeMute : addMute;
    mutation.mutate(muteItem, {
      onSuccess: () => {
        toast({ title: isUserMuted ? `Unmuted ${displayName}` : `Muted ${displayName}` });
        setOpen(false);
      },
      onError: () => {
        toast({ title: 'Error', description: 'Failed to update mute list.', variant: 'destructive' });
      },
    });
  };

  const handleViewProfile = () => {
    setOpen(false);
    navigate(profileUrl);
  };

  const hasAdminActions = isCurrentUserAdmin && !isSelf;
  const hasSelfAdminActions = isCurrentUserAdmin && isSelf && isSpeaker;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        className="w-52 p-1.5 rounded-xl shadow-xl border border-border/60 backdrop-blur-sm"
      >
        {/* Header: avatar + name */}
        <div className="flex items-center gap-2.5 px-2 py-1.5 mb-1">
          <Avatar className="size-8 shrink-0">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-xs">
              {displayName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate leading-tight">{displayName}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">
              {isHost ? 'Host' : isTargetAdmin ? 'Moderator' : isSpeaker ? 'Speaker' : 'Listener'}
            </p>
          </div>
        </div>

        <Separator className="mb-1" />

        {/* Universal actions */}
        <MenuItem icon={<ExternalLink />} label="View Profile" onClick={handleViewProfile} />

        {canZapUser && authorEvent && (
          <ZapDialog target={authorEvent}>
            <MenuItem icon={<Zap />} label="Zap" onClick={() => setOpen(false)} />
          </ZapDialog>
        )}

        {user && !isSelf && (
          <MenuItem
            icon={isFollowed ? <UserMinus /> : <UserPlus />}
            label={isFollowed ? 'Unfollow' : 'Follow'}
            onClick={handleFollow}
            disabled={followPending}
          />
        )}

        {user && !isSelf && (
          <MenuItem
            icon={<VolumeX />}
            label={isUserMuted ? 'Unmute User' : 'Mute User'}
            onClick={handleMuteUser}
            destructive={!isUserMuted}
          />
        )}

        {/* Admin actions */}
        {hasAdminActions && (
          <>
            <Separator className="my-1" />

            {!isSpeaker ? (
              <MenuItem icon={<ArrowUpFromLine />} label="Add to Stage" onClick={handlePromote} disabled={actionPending} />
            ) : (
              <MenuItem icon={<ArrowDownFromLine />} label="Remove from Stage" onClick={handleDemote} disabled={actionPending} />
            )}

            {isSpeaker && isMicEnabled && (
              <MenuItem icon={<MicOff />} label="Mute Mic" onClick={handleMuteMic} disabled={actionPending} />
            )}

            {!isHost && !isTargetAdmin && (
              <MenuItem icon={<ShieldPlus />} label="Make Moderator" onClick={handleMakeAdmin} disabled={actionPending} />
            )}
            {!isHost && isTargetAdmin && (
              <MenuItem icon={<ShieldMinus />} label="Remove Moderator" onClick={handleRemoveAdmin} disabled={actionPending} destructive />
            )}
          </>
        )}

        {/* Self admin actions */}
        {hasSelfAdminActions && (
          <>
            <Separator className="my-1" />
            <MenuItem icon={<ArrowDownFromLine />} label="Leave Stage" onClick={handleDemote} disabled={actionPending} />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Compact menu item with icon and label. */
function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  destructive,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg text-[13px] transition-colors',
        'hover:bg-accent active:bg-accent/80',
        disabled && 'opacity-40 pointer-events-none',
        destructive ? 'text-destructive' : 'text-popover-foreground',
        '[&_svg]:size-3.5 [&_svg]:shrink-0',
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
