import { useMemo } from "react";
import { nip19 } from "nostr-tools";
import type { NostrEvent } from "@nostrify/nostrify";
import { CalendarClock, ExternalLink, Users, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOpenPost } from "@/hooks/useOpenPost";
import { openUrl } from "@/lib/downloadFile";
import { sanitizeUrl } from "@/lib/sanitizeUrl";
import { getEffectiveStreamStatus } from "@/lib/streamStatus";
import { cn } from "@/lib/utils";

/** NIP-53 Meeting Space ("Interactive room"). The other handled kind is the
 *  30313 Meeting Room event ("Conference event"). */
const MEETING_SPACE_KIND = 30312;

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

interface RoomStatusConfig {
  label: string;
  className: string;
  /** Whether to show a pulsing dot (in-progress states). */
  pulse: boolean;
}

/**
 * Maps a NIP-53 room/meeting status to a badge style. Handles both the
 * 30312 space statuses (open / private / closed) and the 30313 meeting
 * statuses (planned / live / ended).
 */
function getRoomStatusConfig(status: string): RoomStatusConfig {
  switch (status) {
    case "live":
      return { label: "LIVE", className: "bg-red-600/90 text-white border-red-600", pulse: true };
    case "open":
      return { label: "OPEN", className: "bg-green-600/90 text-white border-green-600", pulse: true };
    case "planned":
      return { label: "PLANNED", className: "bg-blue-600/90 text-white border-blue-600", pulse: false };
    case "private":
      return { label: "PRIVATE", className: "bg-amber-500/90 text-white border-amber-500", pulse: false };
    case "closed":
    case "ended":
      return { label: status.toUpperCase(), className: "bg-muted text-muted-foreground border-border", pulse: false };
    default:
      return { label: status.toUpperCase() || "UNKNOWN", className: "bg-muted text-muted-foreground border-border", pulse: false };
  }
}

/**
 * Inline content for NIP-53 Meeting Spaces (kind 30312) and Meeting Room
 * events (kind 30313) — the "interactive rooms" side of NIP-53, distinct
 * from the kind 30311 live streams that `StreamContent` handles.
 *
 * Both kinds are addressable and carry their data in tags (title/room,
 * summary, image, status, service), so the generic naddr fallback would
 * render blank (their `content` is empty). This renders a thumbnail +
 * status badge, the title/summary, and a join button for rooms that
 * expose a `service` URL.
 */
export function InteractiveRoomContent({ event, expanded }: { event: NostrEvent; expanded?: boolean }) {
  const isSpace = event.kind === MEETING_SPACE_KIND;

  const title = getTag(event.tags, "title") || getTag(event.tags, "room") ||
    (isSpace ? "Untitled Room" : "Untitled Meeting");
  const summary = getTag(event.tags, "summary");
  const imageUrl = sanitizeUrl(getTag(event.tags, "image"));
  const serviceUrl = sanitizeUrl(getTag(event.tags, "service"));
  const status = getEffectiveStreamStatus(event);
  const statusConfig = getRoomStatusConfig(status);
  const currentParticipants = getTag(event.tags, "current_participants");

  const startsTag = getTag(event.tags, "starts");
  const startsAt = useMemo(() => {
    if (!startsTag) return undefined;
    const secs = Number(startsTag);
    if (!Number.isFinite(secs) || secs <= 0) return undefined;
    return new Date(secs * 1000);
  }, [startsTag]);
  // Only surface a scheduled time for meetings that haven't started/ended.
  const showStartsAt = startsAt && status === "planned";

  const Icon = isSpace ? Video : CalendarClock;

  const encodedId = useMemo(() => {
    const dTag = getTag(event.tags, "d") || "";
    return nip19.naddrEncode({
      kind: event.kind,
      pubkey: event.pubkey,
      identifier: dTag,
    });
  }, [event]);

  const { onClick: openPost } = useOpenPost(`/${encodedId}`);

  return (
    <div className="mt-2 space-y-2">
      {/* Thumbnail / placeholder with status overlay */}
      <div className="rounded-xl overflow-hidden border border-border">
        {imageUrl ? (
          <div className="relative w-full aspect-video overflow-hidden bg-muted">
            <img
              src={imageUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget.parentElement as HTMLElement).style.display = "none";
              }}
            />
            <div className="absolute top-2 left-2">
              <Badge variant="outline" className={cn("text-[10px]", statusConfig.className)}>
                {statusConfig.pulse && (
                  <div className="size-1.5 bg-white rounded-full animate-pulse mr-1" />
                )}
                {statusConfig.label}
              </Badge>
            </div>
            {currentParticipants && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                <Users className="size-3" />
                {currentParticipants}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 px-3 py-2.5 bg-muted/40">
            <Icon className="size-4 text-primary shrink-0" />
            <Badge variant="outline" className={cn("text-[10px]", statusConfig.className)}>
              {statusConfig.pulse && (
                <div className="size-1.5 bg-white rounded-full animate-pulse mr-1" />
              )}
              {statusConfig.label}
            </Badge>
            {currentParticipants && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3" />
                {currentParticipants}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Title + summary — clickable to open the room/meeting detail */}
      <button
        type="button"
        className="flex items-start gap-2 text-left w-full group"
        onClick={(e) => {
          e.stopPropagation();
          openPost();
        }}
      >
        <Icon className="size-4 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 group-hover:underline">
            {title}
          </h3>
          {summary && (
            <p className={cn("text-xs text-muted-foreground mt-0.5", expanded ? "" : "line-clamp-2")}>
              {summary}
            </p>
          )}
          {showStartsAt && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <CalendarClock className="size-3 shrink-0" />
              {startsAt!.toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          )}
        </div>
      </button>

      {/* Join button for rooms that expose a service URL */}
      {serviceUrl && status !== "closed" && status !== "ended" && (
        <Button
          size="sm"
          className="w-full"
          onClick={(e) => {
            e.stopPropagation();
            openUrl(serviceUrl);
          }}
        >
          <ExternalLink className="size-4 mr-1.5" />
          Join {isSpace ? "room" : "meeting"}
        </Button>
      )}
    </div>
  );
}
