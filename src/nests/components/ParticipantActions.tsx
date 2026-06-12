import { useMemo, type PropsWithChildren } from "react";
import { useNavigate } from "react-router-dom";
import {
  UserPlus, UserMinus, Shield, ShieldOff, Ban, Zap,
  ArrowUpFromLine, ArrowDownFromLine, Eye, VolumeOff, Volume2,
} from "lucide-react";
import type { Event } from "nostr-tools";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarShape } from "@/lib/avatarShape";
import { useAuthor } from "@/hooks/useAuthor";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useFollowList, useFollowActions } from "@/hooks/useFollowActions";
import { useMuteList } from "@/hooks/useMuteList";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useProfileUrl } from "@/hooks/useProfileUrl";
import { getDisplayName } from "@/lib/getDisplayName";
import { ZapDialog } from "@/components/ZapDialog";

import { useNestRoom } from "../nestRoomContextDef";
import { useNests } from "@/contexts/nestsContextDef";
import { useEventModifier } from "../hooks/useEventModifier";
import { getRoomParticipants } from "../lib/room";
import { NESTS_ADMIN_COMMAND_KIND } from "../lib/const";

interface ParticipantActionsProps {
  pubkey: string;
}

/**
 * Wraps a participant avatar with a dropdown: profile preview, follow,
 * mute, zap, and (for hosts/admins) stage + moderation controls.
 */
export function ParticipantActions({ pubkey, children }: PropsWithChildren<ParticipantActionsProps>) {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { event: roomEvent, roomATag, isHost, isHostOrAdmin } = useNestRoom();
  const { session } = useNests();
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  const { data: followList } = useFollowList();
  const { follow, unfollow } = useFollowActions();
  const { isMuted, addMute, removeMute } = useMuteList();
  const { mutate: modifyEvent } = useEventModifier();
  const { mutate: createEvent } = useNostrPublish();

  const isSelf = user?.pubkey === pubkey;
  const following = followList?.pubkeys.includes(pubkey) ?? false;
  const muted = isMuted("pubkey", pubkey);
  const isTargetHost = pubkey === roomEvent.pubkey;
  const lightningAddress = metadata?.lud16 ?? metadata?.lud06;
  const authorEvent = author.data?.event as Event | undefined;

  const participantEntry = useMemo(
    () => getRoomParticipants(roomEvent).find((p) => p.pubkey === pubkey),
    [roomEvent, pubkey],
  );
  const isOnStage =
    participantEntry?.role === "speaker" || participantEntry?.role === "admin" || isTargetHost;
  const isTargetAdmin = participantEntry?.role === "admin";

  const updateRoomParticipant = (targetPubkey: string, newRole: string | null) => {
    modifyEvent({
      baseEvent: roomEvent,
      transformTags: (tags) => {
        const next = tags.filter(([t, pk]) => !(t === "p" && pk === targetPubkey));
        if (newRole) {
          next.push(["p", targetPubkey, "", newRole]);
        }
        return next;
      },
      relays: session?.relays,
    });
  };

  const kickUser = (targetPubkey: string) => {
    createEvent({
      kind: NESTS_ADMIN_COMMAND_KIND,
      content: "",
      tags: [
        ["a", roomATag],
        ["p", targetPubkey],
        ["action", "kick"],
      ],
      created_at: Math.floor(Date.now() / 1000),
      relays: session?.relays,
    });
    updateRoomParticipant(targetPubkey, null);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="cursor-pointer">{children}</div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-64">
        {/* Profile header inside dropdown */}
        <div className="flex items-center gap-3 p-3">
          <Avatar shape={getAvatarShape(metadata)} className="size-12 shrink-0">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="text-sm bg-secondary">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{displayName}</p>
            {metadata?.nip05 && (
              <p className="text-xs text-muted-foreground truncate">{metadata.nip05}</p>
            )}
            {metadata?.about && (
              <p className="text-xs text-muted-foreground/70 line-clamp-2 mt-0.5">{metadata.about}</p>
            )}
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => navigate(profileUrl)}>
          <Eye className="size-4 mr-2" />
          View Profile
        </DropdownMenuItem>

        {!isSelf && user && (
          <DropdownMenuItem onClick={() => (following ? unfollow(pubkey) : follow(pubkey))}>
            {following ? (
              <><UserMinus className="size-4 mr-2" />Unfollow</>
            ) : (
              <><UserPlus className="size-4 mr-2" />Follow</>
            )}
          </DropdownMenuItem>
        )}

        {!isSelf && user && (
          <DropdownMenuItem
            onClick={() =>
              muted
                ? removeMute.mutate({ type: "pubkey", value: pubkey })
                : addMute.mutate({ type: "pubkey", value: pubkey })}
          >
            {muted ? (
              <><Volume2 className="size-4 mr-2" />Unmute</>
            ) : (
              <><VolumeOff className="size-4 mr-2" />Mute</>
            )}
          </DropdownMenuItem>
        )}

        {!isSelf && user && lightningAddress && authorEvent && (
          <ZapDialog target={authorEvent}>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              <Zap className="size-4 mr-2 text-yellow-500" />
              Zap
            </DropdownMenuItem>
          </ZapDialog>
        )}

        {/* Admin actions */}
        {isHostOrAdmin && !isSelf && (
          <>
            <DropdownMenuSeparator />

            {!isOnStage ? (
              <DropdownMenuItem onClick={() => updateRoomParticipant(pubkey, "speaker")}>
                <ArrowUpFromLine className="size-4 mr-2" />
                Add to Stage
              </DropdownMenuItem>
            ) : !isTargetHost ? (
              <DropdownMenuItem onClick={() => updateRoomParticipant(pubkey, null)}>
                <ArrowDownFromLine className="size-4 mr-2" />
                Remove from Stage
              </DropdownMenuItem>
            ) : null}

            {isHost && !isTargetHost && (
              !isTargetAdmin ? (
                <DropdownMenuItem onClick={() => updateRoomParticipant(pubkey, "admin")}>
                  <Shield className="size-4 mr-2" />
                  Make Admin
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => updateRoomParticipant(pubkey, "speaker")}>
                  <ShieldOff className="size-4 mr-2" />
                  Remove Admin
                </DropdownMenuItem>
              )
            )}

            {!isTargetHost && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => kickUser(pubkey)}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                  <Ban className="size-4 mr-2" />
                  Kick
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
