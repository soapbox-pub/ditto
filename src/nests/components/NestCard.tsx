import { useNavigate } from "react-router-dom";
import { Users, Clock, Radio } from "lucide-react";
import type { NostrEvent } from "@nostrify/nostrify";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarShape } from "@/lib/avatarShape";
import { useAuthor } from "@/hooks/useAuthor";
import { getDisplayName } from "@/lib/getDisplayName";
import { timeAgo } from "@/lib/timeAgo";
import { cn } from "@/lib/utils";
import {
  getRoomTitle,
  getRoomSummary,
  getRoomStatus,
  getRoomColor,
  getRoomImage,
  getRoomStarts,
  getRoomParticipants,
  getRoomATag,
  buildRoomNaddr,
} from "../lib/room";
import { useRoomPresence } from "../hooks/useRoomPresence";

interface NestCardProps {
  event: NostrEvent;
}

function HostInfo({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey);

  return (
    <div className="flex items-center gap-2">
      <Avatar shape={getAvatarShape(metadata)} className="size-6">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="text-[10px] bg-white/20 text-white">
          {displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="text-sm text-white/80 truncate">{displayName}</span>
    </div>
  );
}

export function NestCard({ event }: NestCardProps) {
  const navigate = useNavigate();
  const status = getRoomStatus(event);
  const title = getRoomTitle(event);
  const summary = getRoomSummary(event);
  const color = getRoomColor(event);
  const image = getRoomImage(event);
  const starts = getRoomStarts(event);
  const participants = getRoomParticipants(event);
  const roomATag = getRoomATag(event);
  const { data: presenceList } = useRoomPresence(status === "live" ? roomATag : undefined);
  const listenerCount = presenceList?.length ?? participants.length;

  const handleClick = () => {
    const naddr = buildRoomNaddr(event);
    navigate(`/nests/${naddr}`, { state: { event } });
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "group relative w-full rounded-xl overflow-hidden text-left transition-all",
        "hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/10",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "active:scale-[0.99]",
        // Touch-friendly: ensure min height for comfortable tapping
        "min-h-[140px] md:min-h-[160px]",
      )}
    >
      {/* Background */}
      <div className={cn("absolute inset-0", color)} />
      {image && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${image})` }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
      )}

      {/* Content */}
      <div className="relative p-4 md:p-5 flex flex-col gap-2 md:gap-3 min-h-[140px] md:min-h-[160px]">
        {/* Status badge */}
        <div className="flex items-center justify-between">
          {status === "live" ? (
            <Badge className="bg-red-500/90 text-white border-0 gap-1 text-xs">
              <Radio className="size-3 animate-pulse" />
              LIVE
            </Badge>
          ) : status === "planned" ? (
            <Badge className="bg-white/20 text-white border-0 gap-1 text-xs backdrop-blur-sm">
              <Clock className="size-3" />
              {starts && starts * 1000 > Date.now()
                ? `Starts ${new Date(starts * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                : starts
                  ? timeAgo(starts)
                  : "PLANNED"}
            </Badge>
          ) : (
            <Badge className="bg-white/10 text-white/60 border-0 text-xs backdrop-blur-sm">
              ENDED
            </Badge>
          )}

          {status === "live" && listenerCount > 0 && (
            <div className="flex items-center gap-1 text-white/70 text-xs">
              <Users className="size-3" />
              {listenerCount}
            </div>
          )}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-white text-sm md:text-base leading-tight line-clamp-2">
          {title}
        </h3>

        {/* Summary */}
        {summary && (
          <p className="text-white/60 text-xs line-clamp-2">{summary}</p>
        )}

        {/* Host */}
        <div className="mt-auto">
          <HostInfo pubkey={event.pubkey} />
        </div>
      </div>
    </button>
  );
}
