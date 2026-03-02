import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Pause, SkipBack, SkipForward, Maximize2, X, GripVertical } from 'lucide-react';
import { useAudioPlayer } from '@/contexts/AudioPlayerContext';
import { cn } from '@/lib/utils';

const POSITION_KEY = 'audio-minibar-position';
const DRAG_THRESHOLD = 4;

function getStoredPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function clampToViewport(x: number, y: number, w: number, h: number) {
  const maxX = window.innerWidth - w;
  const maxY = window.innerHeight - h;
  return {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(0, Math.min(y, maxY)),
  };
}

/**
 * Floating draggable mini-pill audio player.
 * Uses PointerEvents drag with setPointerCapture, 4px threshold, viewport clamping.
 * Position persisted to localStorage.
 */
export function MinimizedAudioBar() {
  const player = useAudioPlayer();
  const { currentTrack, minimized, isPlaying, currentTime, duration, playlist, currentIndex } = player;

  const navigate = useNavigate();
  const barRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => getStoredPosition() ?? { x: 16, y: window.innerHeight - 80 });
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

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
        const w = el?.offsetWidth ?? 300;
        const h = el?.offsetHeight ?? 64;
        return clampToViewport(p.x, p.y, w, h);
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Persist position
  useEffect(() => {
    try { localStorage.setItem(POSITION_KEY, JSON.stringify(pos)); } catch { /* ignore */ }
  }, [pos]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only drag from the grip handle
    if (!(e.target as HTMLElement).closest('[data-drag-handle]')) return;
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
    const w = el?.offsetWidth ?? 300;
    const h = el?.offsetHeight ?? 64;
    setPos(clampToViewport(startPos.current.x + dx, startPos.current.y + dy, w, h));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (dragging.current) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      dragging.current = false;
    }
  }, []);

  if (!currentTrack || !minimized) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const hasPlaylist = playlist.length > 1;
  const canPrev = hasPlaylist && (currentIndex > 0 || currentTime > 3);
  const canNext = hasPlaylist && currentIndex < playlist.length - 1;

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

        {/* Artwork thumbnail */}
        {currentTrack.artwork ? (
          <img src={currentTrack.artwork} alt="" className="size-10 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="size-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Play className="size-4 text-primary" />
          </div>
        )}

        {/* Title + Artist */}
        <div className="flex-1 min-w-0 px-1">
          <p className="text-sm font-medium truncate leading-tight">{currentTrack.title}</p>
          <p className="text-xs text-muted-foreground truncate">{currentTrack.artist}</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          {hasPlaylist && (
            <button
              onClick={() => player.prevTrack()}
              disabled={!canPrev}
              className="p-1.5 rounded-full hover:bg-secondary transition-colors disabled:opacity-30"
              aria-label="Previous"
            >
              <SkipBack className="size-3.5" />
            </button>
          )}

          <button
            onClick={() => isPlaying ? player.pause() : player.resume()}
            className="p-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="size-3.5" fill="currentColor" /> : <Play className="size-3.5 ml-0.5" fill="currentColor" />}
          </button>

          {hasPlaylist && (
            <button
              onClick={() => player.nextTrack()}
              disabled={!canNext}
              className="p-1.5 rounded-full hover:bg-secondary transition-colors disabled:opacity-30"
              aria-label="Next"
            >
              <SkipForward className="size-3.5" />
            </button>
          )}

          <button
            onClick={() => {
              player.expand();
              if (currentTrack.path) navigate(currentTrack.path);
            }}
            className="p-1.5 rounded-full hover:bg-secondary transition-colors"
            aria-label="Expand"
          >
            <Maximize2 className="size-3.5" />
          </button>

          {showCloseConfirm ? (
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={() => { player.stop(); setShowCloseConfirm(false); }}
                className="text-[10px] px-2 py-1 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Stop
              </button>
              <button
                onClick={() => setShowCloseConfirm(false)}
                className="text-[10px] px-2 py-1 rounded-full bg-secondary hover:bg-secondary/80"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCloseConfirm(true)}
              className="p-1.5 rounded-full hover:bg-secondary transition-colors"
              aria-label="Close"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar at bottom */}
      <div className="mx-3 h-0.5 rounded-full bg-border overflow-hidden -mt-0.5">
        <div className={cn('h-full bg-primary transition-[width] duration-200')} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
