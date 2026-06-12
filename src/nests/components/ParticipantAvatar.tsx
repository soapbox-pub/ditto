import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Mic, MicOff, Hand, Crown, Shield } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthor } from "@/hooks/useAuthor";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getAvatarShape, isEmoji } from "@/lib/avatarShape";
import { getDisplayName } from "@/lib/getDisplayName";
import { cn } from "@/lib/utils";
import { useLocalSpeaking, useRemoteSpeaking } from "../hooks/useSpeakingIndicator";

interface ParticipantAvatarProps {
  pubkey: string;
  isMuted?: boolean;
  handRaised?: boolean;
  role?: string;
  reaction?: { emoji: string; emojiUrl?: string };
  isPublishing?: boolean;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
}

/** Speaking detection wrapper — only mounted when a transport exists. */
function SpeakingDetector({ pubkey, isMuted, children }: {
  pubkey: string;
  isMuted: boolean;
  children: (speaking: boolean) => React.ReactNode;
}) {
  const { user } = useCurrentUser();
  const isMe = user?.pubkey === pubkey;
  const localSpeaking = useLocalSpeaking();
  const remoteSpeaking = useRemoteSpeaking(pubkey);
  const speaking = (isMe ? localSpeaking : remoteSpeaking) && !isMuted;
  return <>{children(speaking)}</>;
}

export function ParticipantAvatar({
  pubkey,
  isMuted = false,
  handRaised = false,
  role,
  reaction,
  isPublishing = false,
  size = "md",
  onClick,
  hasTransport = false,
}: ParticipantAvatarProps & { hasTransport?: boolean }) {
  if (hasTransport) {
    return (
      <SpeakingDetector pubkey={pubkey} isMuted={isMuted}>
        {(speaking) => (
          <ParticipantAvatarInner
            pubkey={pubkey}
            isMuted={isMuted}
            handRaised={handRaised}
            role={role}
            reaction={reaction}
            isPublishing={isPublishing}
            size={size}
            onClick={onClick}
            isSpeaking={speaking}
          />
        )}
      </SpeakingDetector>
    );
  }
  return (
    <ParticipantAvatarInner
      pubkey={pubkey}
      isMuted={isMuted}
      handRaised={handRaised}
      role={role}
      reaction={reaction}
      isPublishing={isPublishing}
      size={size}
      onClick={onClick}
      isSpeaking={false}
    />
  );
}

function ParticipantAvatarInner({
  pubkey,
  isMuted,
  handRaised,
  role,
  reaction,
  isPublishing,
  size,
  onClick,
  isSpeaking,
}: Required<Pick<ParticipantAvatarProps, "pubkey" | "isMuted" | "handRaised" | "isPublishing" | "size">> &
  Pick<ParticipantAvatarProps, "role" | "reaction" | "onClick"> & { isSpeaking: boolean }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey);
  const avatarShape = getAvatarShape(metadata);
  const isShaped = !!avatarShape && isEmoji(avatarShape);

  // Track avatar position for portal-based reaction
  const avatarRef = useRef<HTMLDivElement>(null);
  const [reactionPos, setReactionPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (reaction && avatarRef.current) {
      const rect = avatarRef.current.getBoundingClientRect();
      setReactionPos({
        top: rect.top - 10,
        left: rect.left + rect.width / 2,
      });
    } else {
      setReactionPos(null);
    }
  }, [reaction]);

  const sizeClasses = {
    sm: "size-12 md:size-14",
    md: "size-16 md:size-[72px]",
    lg: "size-[72px] md:size-20",
  };

  const iconSize = {
    sm: "size-3.5",
    md: "size-4",
    lg: "size-4 md:size-5",
  };

  return (
    <div className="flex flex-col items-center gap-1.5 md:gap-2 group" onClick={onClick}>
      <div className="relative" ref={avatarRef}>
        {/* Avatar; speaking glow uses drop-shadow for shaped avatars, ring for circles */}
        <div
          className={cn(
            "transition-all duration-300",
            !isShaped && "rounded-full p-0.5",
            !isShaped && isSpeaking && isPublishing &&
              "ring-2 ring-green-400 ring-offset-2 ring-offset-background",
            !isShaped && !isSpeaking && isPublishing &&
              "ring-1 ring-primary/30 ring-offset-1 ring-offset-background",
          )}
          style={
            isShaped && isSpeaking && isPublishing
              ? { filter: "drop-shadow(0 0 4px rgb(74 222 128)) drop-shadow(0 0 1px rgb(74 222 128))" }
              : undefined
          }
        >
          <Avatar shape={avatarShape} className={cn(sizeClasses[size], "cursor-pointer")}>
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="text-xs md:text-sm bg-secondary">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Mic indicator (for speakers) */}
        {isPublishing && (
          <div
            className={cn(
              "absolute -bottom-0.5 left-1/2 -translate-x-1/2",
              "rounded-full p-1",
              isSpeaking ? "bg-green-500" : isMuted ? "bg-destructive" : "bg-primary",
            )}
          >
            {isMuted ? (
              <MicOff className={cn(iconSize[size], "text-white")} />
            ) : (
              <Mic className={cn(iconSize[size], "text-white")} />
            )}
          </div>
        )}

        {/* Hand raised */}
        {handRaised && (
          <div className="absolute -top-1 -right-1 bg-yellow-500 rounded-full p-1 animate-bounce">
            <Hand className={cn(iconSize[size], "text-white")} />
          </div>
        )}

        {/* Reaction rendered via portal so it floats above all containers */}
        {reaction && reactionPos && createPortal(
          <div
            className="fixed z-20 nest-react text-4xl md:text-5xl pointer-events-none"
            style={{
              top: reactionPos.top,
              left: reactionPos.left,
              transform: "translateX(-50%)",
            }}
          >
            {reaction.emojiUrl ? (
              <img src={reaction.emojiUrl} alt={reaction.emoji} className="size-10 md:size-12 object-contain" />
            ) : (
              reaction.emoji
            )}
          </div>,
          document.body,
        )}

        {/* Role badge */}
        {role === "host" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="absolute -top-1 -left-1 bg-yellow-500 rounded-full p-0.5">
                <Crown className="size-3 text-white" />
              </div>
            </TooltipTrigger>
            <TooltipContent>Host</TooltipContent>
          </Tooltip>
        )}
        {role === "admin" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="absolute -top-1 -left-1 bg-blue-500 rounded-full p-0.5">
                <Shield className="size-3 text-white" />
              </div>
            </TooltipTrigger>
            <TooltipContent>Admin</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Name */}
      <span className="text-xs md:text-sm text-muted-foreground truncate max-w-[80px] md:max-w-[100px] text-center">
        {displayName}
      </span>
    </div>
  );
}
