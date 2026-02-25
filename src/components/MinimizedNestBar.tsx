import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, Maximize2, X, GripVertical } from 'lucide-react';
import { useLocalParticipant, RoomContext } from '@livekit/components-react';

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
import { Button } from '@/components/ui/button';
import { useNestSession } from '@/contexts/NestSessionContext';
import { cn } from '@/lib/utils';

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

/** localStorage key for persisted position. */
const POSITION_KEY = 'nest-minibar-position';

interface Position {
  x: number;
  y: number;
}

function loadPosition(): Position | null {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (!raw) return null;
    const pos = JSON.parse(raw);
    if (typeof pos.x === 'number' && typeof pos.y === 'number') return pos;
  } catch { /* ignore */ }
  return null;
}

function savePosition(pos: Position) {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(pos));
  } catch { /* ignore */ }
}

/**
 * Floating draggable mini-pill shown when a nest is minimized.
 * Can be dragged anywhere on screen. Position persists in localStorage.
 */
export function MinimizedNestBar() {
  const session = useNestSession();
  const navigate = useNavigate();

  // Position state — null means use default CSS position
  const [position, setPosition] = useState<Position | null>(loadPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ px: number; py: number; sx: number; sy: number } | null>(null);
  const didDragRef = useRef(false);

  // Clamp position to viewport bounds
  const clamp = useCallback((pos: Position): Position => {
    const el = dragRef.current;
    if (!el) return pos;
    const rect = el.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;
    return {
      x: Math.max(0, Math.min(pos.x, maxX)),
      y: Math.max(0, Math.min(pos.y, maxY)),
    };
  }, []);

  // Re-clamp on window resize
  useEffect(() => {
    if (!position) return;
    const handleResize = () => {
      setPosition((prev) => prev ? clamp(prev) : prev);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [position, clamp]);

  // Pointer handlers for drag
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only drag from the grip area or the gradient strip
    const el = dragRef.current;
    if (!el) return;

    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const rect = el.getBoundingClientRect();
    dragStartRef.current = {
      px: e.clientX,
      py: e.clientY,
      sx: rect.left,
      sy: rect.top,
    };
    didDragRef.current = false;
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const { px, py, sx, sy } = dragStartRef.current;
    const dx = e.clientX - px;
    const dy = e.clientY - py;

    // Only count as drag if moved more than 4px
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      didDragRef.current = true;
    }

    const newPos = clamp({ x: sx + dx, y: sy + dy });
    setPosition(newPos);
  }, [clamp]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    dragStartRef.current = null;
    setIsDragging(false);
    // Persist final position
    if (position) {
      savePosition(position);
    }
    // Reset drag flag after a short delay so the click handler
    // on the title area can check it, but it doesn't linger.
    setTimeout(() => { didDragRef.current = false; }, 100);
  }, [position]);

  if (!session.isActive || !session.minimized || !session.event) return null;

  const title = getTag(session.event.tags, 'title') || 'Nest';
  const color = getTag(session.event.tags, 'color');
  const gradient = (color && NEST_GRADIENTS[color]) || NEST_GRADIENTS['gradient-5'];

  const handleExpand = () => {
    session.expand();
    navigate(`/${session.naddr}`);
  };

  /** Expand from the title tap — gated by drag detection. */
  const handleTitleTap = () => {
    if (didDragRef.current) return;
    handleExpand();
  };

  const handleLeave = () => {
    session.leaveNest();
  };

  // Style: use absolute pixel position if dragged, otherwise default CSS
  const positionStyle: React.CSSProperties = position
    ? { left: position.x, top: position.y }
    : {};

  return (
    <div
      ref={dragRef}
      className={cn(
        'fixed z-30',
        !isDragging && 'transition-shadow duration-200',
        isDragging && 'shadow-2xl',
        // Default position (when not dragged yet)
        !position && 'sidebar:bottom-20 sidebar:left-5',
        !position && 'max-sidebar:bottom-[calc(4rem+env(safe-area-inset-bottom))] max-sidebar:left-3 max-sidebar:right-3',
      )}
      style={positionStyle}
    >
      <div
        className={cn(
          'rounded-2xl shadow-xl border border-border/50 overflow-hidden',
          'bg-background/95 backdrop-blur-xl',
          'w-[268px] max-sidebar:w-auto',
          isDragging && 'scale-[1.02] shadow-2xl',
          !isDragging && 'transition-transform duration-150',
        )}
      >
        {/* Drag handle + gradient strip */}
        <div
          className="h-6 flex items-center justify-center cursor-grab active:cursor-grabbing select-none touch-none"
          style={{ backgroundImage: gradient }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <GripVertical className="size-3.5 text-white/70" />
        </div>

        <div className="flex items-center gap-2 px-3 py-2">
          {/* Clickable room info — expands to full view */}
          <button
            type="button"
            className="flex items-center gap-2.5 min-w-0 flex-1"
            onClick={handleTitleTap}
          >
            <div
              className="size-9 rounded-xl shrink-0 shadow-inner"
              style={{ backgroundImage: gradient }}
            />
            <div className="min-w-0 text-left">
              <p className="text-[13px] font-semibold truncate leading-tight">{title}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Tap to expand</p>
            </div>
          </button>

          {/* Controls */}
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Mic toggle — needs LiveKit context */}
            {session.room && (
              <RoomContext.Provider value={session.room}>
                <MiniBarMicButton />
              </RoomContext.Provider>
            )}

            {/* Expand */}
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-full"
              onClick={handleExpand}
            >
              <Maximize2 className="size-3.5" />
            </Button>

            {/* Leave — with confirmation */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-full text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <X className="size-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Leave this nest?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You will be disconnected from the audio room.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleLeave}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Leave
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Mic toggle button that reads LiveKit local participant state. */
function MiniBarMicButton() {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const isOnStage = localParticipant?.permissions?.canPublish ?? false;

  if (!isOnStage) return null;

  const handleToggle = async () => {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      // ignore
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        'size-7 rounded-full',
        isMicrophoneEnabled
          ? 'text-primary'
          : 'text-destructive',
      )}
      onClick={handleToggle}
    >
      {isMicrophoneEnabled ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
    </Button>
  );
}
