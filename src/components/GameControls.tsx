import { useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { impactLight } from '@/lib/haptics';
import type { WebxdcHandle } from '@/components/Webxdc';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GameControlsProps {
  webxdcHandle: WebxdcHandle | null;
  className?: string;
}

// Key mappings for each button.
const KEY_MAP = {
  up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  a: { key: 'x', code: 'KeyX', keyCode: 88 },
  b: { key: 'z', code: 'KeyZ', keyCode: 90 },
  start: { key: 'Enter', code: 'Enter', keyCode: 13 },
  select: { key: 'Shift', code: 'ShiftRight', keyCode: 16 },
} as const;

type GameButton = keyof typeof KEY_MAP;

/** Buttons that trigger haptic feedback on press. */
const HAPTIC_BUTTONS = new Set<GameButton>(['a', 'b']);

/** Trigger a short vibration via the native haptic engine. */
function haptic() {
  impactLight();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Virtual gamepad: d-pad + A/B + Start/Select. Buttons send synthetic key
 * events into the webxdc iframe via `webxdc.keyboard` postMessage.
 */
export function GameControls({ webxdcHandle, className }: GameControlsProps) {
  const activeKeys = useRef(new Set<string>());

  const sendKey = useCallback(
    (type: 'keydown' | 'keyup', button: GameButton) => {
      if (!webxdcHandle) return;
      const { key, code, keyCode } = KEY_MAP[button];

      if (type === 'keydown') {
        if (activeKeys.current.has(code)) return;
        activeKeys.current.add(code);
        if (HAPTIC_BUTTONS.has(button)) haptic();
      } else {
        activeKeys.current.delete(code);
      }

      webxdcHandle.postMessage({
        jsonrpc: '2.0',
        method: 'webxdc.keyboard',
        params: { type, key, code, keyCode },
      });
    },
    [webxdcHandle],
  );

  const handlers = (button: GameButton) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      sendKey('keydown', button);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      sendKey('keyup', button);
    },
    onPointerCancel: (e: React.PointerEvent) => {
      e.preventDefault();
      sendKey('keyup', button);
    },
    onContextMenu: (e: React.SyntheticEvent) => e.preventDefault(),
  });

  return (
    <div
      className={cn(
        'flex flex-col gap-2 px-4 pb-4 pt-2 select-none touch-none',
        className,
      )}
    >
      {/* Main controls row: D-pad on left, A/B on right */}
      <div className="flex items-center justify-between">
        {/* D-Pad */}
        <div className="relative size-[132px]">
          {/* Cross background */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-11 h-full rounded-lg bg-muted/80 backdrop-blur-sm border border-border/50" />
            <div className="absolute w-full h-11 rounded-lg bg-muted/80 backdrop-blur-sm border border-border/50" />
          </div>
          {/* Up */}
          <button
            className="absolute top-0 left-1/2 -translate-x-1/2 w-11 h-11 flex items-center justify-center rounded-lg active:bg-primary/20 transition-colors z-10"
            aria-label="D-pad up"
            {...handlers('up')}
          >
            <svg width="16" height="10" viewBox="0 0 16 10" className="text-foreground/70">
              <path d="M8 1L14 9H2L8 1Z" fill="currentColor" />
            </svg>
          </button>
          {/* Down */}
          <button
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-11 h-11 flex items-center justify-center rounded-lg active:bg-primary/20 transition-colors z-10"
            aria-label="D-pad down"
            {...handlers('down')}
          >
            <svg width="16" height="10" viewBox="0 0 16 10" className="text-foreground/70">
              <path d="M8 9L2 1H14L8 9Z" fill="currentColor" />
            </svg>
          </button>
          {/* Left */}
          <button
            className="absolute left-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-lg active:bg-primary/20 transition-colors z-10"
            aria-label="D-pad left"
            {...handlers('left')}
          >
            <svg width="10" height="16" viewBox="0 0 10 16" className="text-foreground/70">
              <path d="M1 8L9 2V14L1 8Z" fill="currentColor" />
            </svg>
          </button>
          {/* Right */}
          <button
            className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-lg active:bg-primary/20 transition-colors z-10"
            aria-label="D-pad right"
            {...handlers('right')}
          >
            <svg width="10" height="16" viewBox="0 0 10 16" className="text-foreground/70">
              <path d="M9 8L1 14V2L9 8Z" fill="currentColor" />
            </svg>
          </button>
        </div>

        {/* A / B buttons */}
        <div className="flex items-center gap-3">
          <button
            className="size-14 rounded-full bg-muted/80 backdrop-blur-sm border border-border/50 flex items-center justify-center active:bg-primary/20 active:scale-95 transition-all text-sm font-bold text-foreground/70"
            aria-label="B button"
            {...handlers('b')}
          >
            B
          </button>
          <button
            className="size-14 rounded-full bg-muted/80 backdrop-blur-sm border border-border/50 flex items-center justify-center active:bg-primary/20 active:scale-95 transition-all text-sm font-bold text-foreground/70 -mt-8"
            aria-label="A button"
            {...handlers('a')}
          >
            A
          </button>
        </div>
      </div>

      {/* Start / Select row */}
      <div className="flex items-center justify-center gap-6">
        <button
          className="h-8 px-4 rounded-full bg-muted/80 backdrop-blur-sm border border-border/50 flex items-center justify-center active:bg-primary/20 active:scale-95 transition-all text-[10px] font-bold uppercase tracking-wider text-foreground/60"
          aria-label="Select"
          {...handlers('select')}
        >
          Select
        </button>
        <button
          className="h-8 px-4 rounded-full bg-muted/80 backdrop-blur-sm border border-border/50 flex items-center justify-center active:bg-primary/20 active:scale-95 transition-all text-[10px] font-bold uppercase tracking-wider text-foreground/60"
          aria-label="Start"
          {...handlers('start')}
        >
          Start
        </button>
      </div>
    </div>
  );
}

export default GameControls;
