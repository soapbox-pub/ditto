import { useNavigate } from "react-router-dom";
import { Hand, Mic, MicOff, MessageCircle, Minimize2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArcBackground } from "@/components/ArcBackground";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";

import { ReactionsButton } from "./ReactionsButton";
import { useNestRoom } from "../nestRoomContextDef";
import { useNests } from "@/contexts/nestsContextDef";
import { useLocalParticipantSafe } from "../hooks/useTransportSafe";
import { NEST_BAR_ICON, NEST_BAR_ITEM, NEST_BAR_LABEL } from "./nestBarStyles";

interface NestMenuBarProps {
  onChatToggle?: () => void;
  chatOpen?: boolean;
}

/**
 * In-room quick actions: minimize, hand raise, mic, chat, reactions.
 *
 * Mobile: a curved bar matching the app's bottom nav (ArcBackground + labeled
 * items), fixed above it. Desktop: a floating pill above the participants.
 * Room-level actions (leave, share, edit, leave stage, volume) live in the
 * banner at the top of the page to keep this bar uncrowded.
 */
export function NestMenuBar({ onChatToggle, chatOpen }: NestMenuBarProps) {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { roomATag } = useNestRoom();
  const { session, handRaised, setHandRaised } = useNests();
  const { isMicEnabled, isPublishing, setMicEnabled } = useLocalParticipantSafe();

  const inSession = !!session;
  // Hand raise is available for any logged-in user who has joined
  const showHandRaise = !!user && inSession;

  return (
    <div
      className={cn(
        // Mobile: fixed full-width above the app bottom nav
        "fixed bottom-14 left-0 right-0 z-30",
        // Desktop: floating pill centered
        "sidebar:static sidebar:bottom-auto sidebar:z-auto",
        "sidebar:mx-auto sidebar:mb-4 sidebar:max-w-lg sidebar:w-fit",
      )}
    >
      <div
        className={cn(
          "relative",
          "sidebar:rounded-full sidebar:border sidebar:border-border/50 sidebar:px-4 sidebar:py-2",
          "sidebar:bg-background/80 sidebar:backdrop-blur-sm sidebar:shadow-lg sidebar:shadow-black/20",
        )}
      >
        {/* Curved backdrop matching the app's bottom nav (mobile only) */}
        <ArcBackground variant="up" className="sidebar:hidden" />

        <div className="relative h-12 flex items-center justify-around px-4 sidebar:h-auto sidebar:justify-center sidebar:gap-3 sidebar:px-0">
          {/* Minimize: browse the app while staying in the nest */}
          {inSession && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button className={NEST_BAR_ITEM} onClick={() => navigate("/nests")}>
                  <Minimize2 className={NEST_BAR_ICON} />
                  <span className={NEST_BAR_LABEL}>Minimize</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>Minimize</TooltipContent>
            </Tooltip>
          )}

          {/* Hand raise */}
          {showHandRaise && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    NEST_BAR_ITEM,
                    handRaised && "text-yellow-500 sidebar:bg-yellow-500/20 sidebar:hover:bg-yellow-500/30",
                  )}
                  onClick={() => setHandRaised(!handRaised)}
                >
                  <Hand className={NEST_BAR_ICON} />
                  <span className={NEST_BAR_LABEL}>{handRaised ? "Lower" : "Raise"}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>{handRaised ? "Lower Hand" : "Raise Hand"}</TooltipContent>
            </Tooltip>
          )}

          {/* Mute toggle — primary action when on stage */}
          {isPublishing && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    NEST_BAR_ITEM,
                    "sidebar:size-14",
                    isMicEnabled
                      ? "text-primary"
                      : "text-destructive sidebar:bg-destructive/20 sidebar:hover:bg-destructive/30",
                  )}
                  onClick={() => setMicEnabled(!isMicEnabled)}
                >
                  {isMicEnabled ? (
                    <Mic className="size-5 sidebar:size-8" />
                  ) : (
                    <MicOff className="size-5 sidebar:size-8" />
                  )}
                  <span className={NEST_BAR_LABEL}>{isMicEnabled ? "Mute" : "Unmute"}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>{isMicEnabled ? "Mute" : "Unmute"}</TooltipContent>
            </Tooltip>
          )}

          {/* Chat toggle */}
          {onChatToggle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(NEST_BAR_ITEM, chatOpen && "text-primary sidebar:bg-primary/20")}
                  onClick={onChatToggle}
                >
                  <MessageCircle className={NEST_BAR_ICON} />
                  <span className={NEST_BAR_LABEL}>Chat</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>{chatOpen ? "Hide Chat" : "Show Chat"}</TooltipContent>
            </Tooltip>
          )}

          {/* Reactions */}
          <ReactionsButton roomATag={roomATag} />
        </div>
      </div>
    </div>
  );
}
