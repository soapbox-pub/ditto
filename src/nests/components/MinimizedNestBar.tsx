import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, MicOff, Maximize2, X, GripVertical, Radio, Loader2 } from "lucide-react";
import { useNests } from "@/contexts/nestsContextDef";
import { useLocalParticipantSafe } from "../hooks/useTransportSafe";
import { useRoomPresence } from "../hooks/useRoomPresence";
import { getRoomTitle } from "../lib/room";
import { cn } from "@/lib/utils";

const POSITION_KEY = "nests-minibar-position";
const DRAG_THRESHOLD = 4;
const BAR_W = 300;
const BAR_H = 64;

function getStoredPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function getBottomOffset() {
  // On mobile (below sidebar breakpoint), reserve space for the bottom nav (56px)
  const hasSidebar = window.matchMedia("(min-width: 900px)").matches;
  return hasSidebar ? 0 : 56;
}

function clampToViewport(x: number, y: number, w: number, h: number) {
  const maxX = window.innerWidth - w;
  const maxY = window.innerHeight - h - getBottomOffset();
  return {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(0, Math.min(y, maxY)),
  };
}

/**
 * Floating draggable pill for the active nest while browsing the app.
 * Mirrors MinimizedAudioBar, with a different default position (stacked
 * above the audio bar) so the two pills don't overlap.
 *
 * Unlike the music bar, this also shows on mobile: an active live room
 * needs a visible leave/return affordance everywhere.
 */
export function MinimizedNestBar() {
  const { session, transport, connectionState, leaveNest } = useNests();
  const { isMicEnabled, isPublishing, setMicEnabled } = useLocalParticipantSafe();
  const { data: presenceList } = useRoomPresence(session?.minimized ? session.roomATag : undefined);

  const navigate = useNavigate();
  const barRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => {
    const stored = getStoredPosition();
    // Default: above where the music bar sits (music default y = innerHeight - 80)
    const defaultPos = { x: 16, y: window.innerHeight - 160 - getBottomOffset() };
    if (!stored) return defaultPos;
    return clampToViewport(stored.x, stored.y, BAR_W, BAR_H);
  });

  // Drag state
  const dragging = useRef(false);
  const dragStarted = useRef(false);
  const startPointer = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });

  // Reclamp on resize
  useEffect(() => {
    const onResize = () => {
      setPos((p) => {
        const el = barRef.current;
        const w = el?.offsetWidth ?? BAR_W;
        const h = el?.offsetHeight ?? BAR_H;
        return clampToViewport(p.x, p.y, w, h);
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Persist position
  useEffect(() => {
    try { localStorage.setItem(POSITION_KEY, JSON.stringify(pos)); } catch { /* ignore */ }
  }, [pos]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!(e.target as HTMLElement).closest("[data-drag-handle]")) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    dragStarted.current = false;
    startPointer.current = { x: e.clientX, y: e.clientY };
    startPos.current = { ...pos };
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - startPointer.current.x;
    const dy = e.clientY - startPointer.current.y;
    if (!dragStarted.current && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
    dragStarted.current = true;

    const el = barRef.current;
    const w = el?.offsetWidth ?? BAR_W;
    const h = el?.offsetHeight ?? BAR_H;
    setPos(clampToViewport(startPos.current.x + dx, startPos.current.y + dy, w, h));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (dragging.current) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      dragging.current = false;
    }
  }, []);

  if (!session || !session.minimized) return null;

  const title = getRoomTitle(session.roomEvent);
  const listenerCount = presenceList?.length ?? 0;
  const connecting = connectionState === "connecting" || connectionState === "reconnecting";

  const goToRoom = () => navigate(`/nests/${session.naddr}`);

  return (
    <div
      ref={barRef}
      className="fixed z-30 select-none touch-none"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="flex items-center gap-2 rounded-2xl bg-background/95 backdrop-blur-md border border-border shadow-lg px-2 py-1.5 min-w-[280px] max-w-[360px]">
        {/* Drag handle */}
        <div data-drag-handle className="cursor-grab active:cursor-grabbing shrink-0 p-1 -ml-0.5 text-muted-foreground/50 hover:text-muted-foreground">
          <GripVertical className="size-4" />
        </div>

        {/* Live indicator */}
        <button
          onClick={goToRoom}
          className="size-10 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0"
          aria-label="Return to nest"
        >
          {connecting ? (
            <Loader2 className="size-4 text-red-500 animate-spin" />
          ) : (
            <Radio className="size-4 text-red-500 animate-pulse" />
          )}
        </button>

        {/* Title + status — clicking returns to the room */}
        <button onClick={goToRoom} className="flex-1 min-w-0 px-1 text-left">
          <p className="text-sm font-medium truncate leading-tight">{title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {connecting
              ? "Connecting…"
              : listenerCount > 0
                ? `${listenerCount} listening`
                : "Live nest"}
          </p>
        </button>

        {/* Controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Mic toggle — only when on stage */}
          {transport && isPublishing && (
            <button
              onClick={() => setMicEnabled(!isMicEnabled)}
              className={cn(
                "p-1.5 rounded-full transition-colors",
                isMicEnabled
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-destructive/20 text-destructive hover:bg-destructive/30",
              )}
              aria-label={isMicEnabled ? "Mute" : "Unmute"}
            >
              {isMicEnabled ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
            </button>
          )}

          <button
            onClick={goToRoom}
            className="p-1.5 rounded-full hover:bg-secondary transition-colors"
            aria-label="Expand"
          >
            <Maximize2 className="size-3.5" />
          </button>

          <button
            onClick={() => leaveNest()}
            className="p-1.5 rounded-full hover:bg-secondary transition-colors"
            aria-label="Leave nest"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
