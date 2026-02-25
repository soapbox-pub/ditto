import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, UserPlus, UserMinus, MicOff, ArrowUpFromLine, ArrowDownFromLine, ShieldPlus, ShieldMinus, VolumeX, ExternalLink } from 'lucide-react';
import type { RemoteParticipant, LocalParticipant as LKLocalParticipant } from 'livekit-client';

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
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

interface ParticipantActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participant: RemoteParticipant | LKLocalParticipant;
  /** The room event's pubkey (host). */
  hostPubkey: string;
  /** The room's d-tag (room ID for API calls). */
  roomId: string;
  /** Pubkeys of current room admins. */
  adminPubkeys: Set<string>;
  /** Whether the current logged-in user is a room admin (or host). */
  isCurrentUserAdmin: boolean;
}

export function ParticipantActionSheet({
  open,
  onOpenChange,
  participant,
  hostPubkey,
  roomId,
  adminPubkeys,
  isCurrentUserAdmin,
}: ParticipantActionSheetProps) {
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

  /** Helper to run an async admin action with loading state and error handling. */
  const runAction = useCallback(async (label: string, fn: () => Promise<void>) => {
    setActionPending(true);
    try {
      await fn();
      onOpenChange(false);
    } catch (err) {
      console.error(`Failed to ${label}:`, err);
      toast({ title: 'Error', description: `Could not ${label}.`, variant: 'destructive' });
    } finally {
      setActionPending(false);
    }
  }, [onOpenChange, toast]);

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
        onOpenChange(false);
      },
      onError: () => {
        toast({ title: 'Error', description: 'Failed to update mute list.', variant: 'destructive' });
      },
    });
  };

  const handleViewProfile = () => {
    onOpenChange(false);
    navigate(profileUrl);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <div className="flex items-center gap-3">
            <Avatar className="size-12">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <DrawerTitle className="text-base truncate">{displayName}</DrawerTitle>
              <DrawerDescription className="text-xs">
                {isHost ? 'Host' : isTargetAdmin ? 'Moderator' : isSpeaker ? 'Speaker' : 'Listener'}
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-1">
          {/* ── Universal actions ── */}

          {/* View Profile */}
          <ActionRow icon={<ExternalLink className="size-4" />} label="View Profile" onClick={handleViewProfile} />

          {/* Zap */}
          {canZapUser && authorEvent && (
            <ZapDialog target={authorEvent}>
              <ActionRow icon={<Zap className="size-4" />} label={`Zap ${displayName}`} onClick={() => onOpenChange(false)} />
            </ZapDialog>
          )}

          {/* Follow / Unfollow */}
          {user && !isSelf && (
            <ActionRow
              icon={isFollowed ? <UserMinus className="size-4" /> : <UserPlus className="size-4" />}
              label={isFollowed ? 'Unfollow' : 'Follow'}
              onClick={handleFollow}
              disabled={followPending}
            />
          )}

          {/* Mute / Unmute user */}
          {user && !isSelf && (
            <ActionRow
              icon={<VolumeX className="size-4" />}
              label={isUserMuted ? 'Unmute User' : 'Mute User'}
              onClick={handleMuteUser}
              className={!isUserMuted ? 'text-destructive' : undefined}
            />
          )}

          {/* ── Admin / Host actions ── */}
          {isCurrentUserAdmin && !isSelf && (
            <>
              <Separator className="my-2" />

              {/* Promote / Demote stage */}
              {!isSpeaker ? (
                <ActionRow
                  icon={<ArrowUpFromLine className="size-4" />}
                  label="Add to Stage"
                  onClick={handlePromote}
                  disabled={actionPending}
                />
              ) : (
                <ActionRow
                  icon={<ArrowDownFromLine className="size-4" />}
                  label="Remove from Stage"
                  onClick={handleDemote}
                  disabled={actionPending}
                />
              )}

              {/* Mute microphone (only if on stage and mic is on) */}
              {isSpeaker && isMicEnabled && (
                <ActionRow
                  icon={<MicOff className="size-4" />}
                  label="Mute Microphone"
                  onClick={handleMuteMic}
                  disabled={actionPending}
                />
              )}

              {/* Make / Remove moderator (not for the host) */}
              {!isHost && !isTargetAdmin && (
                <ActionRow
                  icon={<ShieldPlus className="size-4" />}
                  label="Make Moderator"
                  onClick={handleMakeAdmin}
                  disabled={actionPending}
                />
              )}
              {!isHost && isTargetAdmin && (
                <ActionRow
                  icon={<ShieldMinus className="size-4" />}
                  label="Remove Moderator"
                  onClick={handleRemoveAdmin}
                  disabled={actionPending}
                  className="text-destructive"
                />
              )}
            </>
          )}

          {/* ── Self admin actions ── */}
          {isCurrentUserAdmin && isSelf && isSpeaker && (
            <>
              <Separator className="my-2" />
              <ActionRow
                icon={<ArrowDownFromLine className="size-4" />}
                label="Leave Stage"
                onClick={handleDemote}
                disabled={actionPending}
              />
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** A single action row in the participant menu. */
function ActionRow({
  icon,
  label,
  onClick,
  disabled,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
        'hover:bg-secondary/60 active:bg-secondary',
        disabled && 'opacity-50 pointer-events-none',
        className,
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
