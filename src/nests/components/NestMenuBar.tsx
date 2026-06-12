import { useNavigate } from "react-router-dom";
import { Hand, Mic, MicOff, MessageCircle, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";

import { ReactionsButton } from "./ReactionsButton";
import { useNestRoom } from "../nestRoomContextDef";
import { useNests } from "@/contexts/nestsContextDef";
import { useLocalParticipantSafe } from "../hooks/useTransportSafe";

// Consistent large button sizes for easy tapping
const BTN = "rounded-full size-12";
const ICON = "size-7";
// Larger mic button — primary action when on stage
const MIC_BTN = "rounded-full size-14";
const MIC_ICON = "size-8";

interface NestMenuBarProps {
  onChatToggle?: () => void;
  chatOpen?: boolean;
}

/**
 * In-room quick actions: minimize, hand raise, mic, chat, reactions.
 * Room-level actions (leave, share, edit, leave stage, volume) live in
 * the banner at the top of the page to keep this bar uncrowded.
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
        "flex items-center justify-center gap-1",
        // Mobile: fixed full-width bar at bottom (above the bottom nav)
        "fixed bottom-14 left-0 right-0 z-30 bg-background border-t border-border px-3 py-2",
        "pb-[max(0.5rem,env(safe-area-inset-bottom))]",
        // Desktop: floating pill centered
        "sidebar:static sidebar:inset-auto sidebar:z-auto sidebar:bottom-auto",
        "sidebar:mx-auto sidebar:mb-4 sidebar:max-w-lg sidebar:w-fit",
        "sidebar:rounded-full sidebar:border sidebar:border-border/50 sidebar:px-4 sidebar:py-2",
        "sidebar:bg-background/80 sidebar:backdrop-blur-sm sidebar:shadow-lg sidebar:shadow-black/20",
      )}
    >
      {/* Minimize: browse the app while staying in the nest */}
      {inSession && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={BTN}
              onClick={() => navigate("/nests")}
            >
              <Minimize2 className={ICON} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Minimize</TooltipContent>
        </Tooltip>
      )}

      {/* Hand raise */}
      {showHandRaise && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                BTN,
                handRaised && "bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30",
              )}
              onClick={() => setHandRaised(!handRaised)}
            >
              <Hand className={ICON} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{handRaised ? "Lower Hand" : "Raise Hand"}</TooltipContent>
        </Tooltip>
      )}

      {/* Mute toggle — larger, primary action */}
      {isPublishing && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                MIC_BTN,
                !isMicEnabled && "bg-destructive/20 text-destructive hover:bg-destructive/30",
              )}
              onClick={() => setMicEnabled(!isMicEnabled)}
            >
              {isMicEnabled ? <Mic className={MIC_ICON} /> : <MicOff className={MIC_ICON} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isMicEnabled ? "Mute" : "Unmute"}</TooltipContent>
        </Tooltip>
      )}

      {/* Chat toggle */}
      {onChatToggle && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(BTN, chatOpen && "bg-primary/20 text-primary")}
              onClick={onChatToggle}
            >
              <MessageCircle className={ICON} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{chatOpen ? "Hide Chat" : "Show Chat"}</TooltipContent>
        </Tooltip>
      )}

      {/* Reactions */}
      <ReactionsButton roomATag={roomATag} />
    </div>
  );
}
