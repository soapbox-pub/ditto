import { useCallback, useRef, useState } from 'react';

interface TiltState {
  rotateX: number;
  rotateY: number;
  scale: number;
}

const INITIAL: TiltState = { rotateX: 0, rotateY: 0, scale: 1 };

/** Delay (ms) before the tilt resets after a touch ends. */
const TOUCH_LINGER_MS = 600;

/**
 * Provides a 3D perspective-tilt effect driven by pointer position
 * relative to the element. Supports mouse, touch, and pen inputs.
 *
 * Touch interactions require a press-and-drag gesture: the tilt follows
 * the finger while it is down, and holds briefly after release before
 * smoothly resetting. The element sets `touch-action: none` to prevent
 * the browser from hijacking the gesture for scrolling.
 *
 * @param maxTilt  Maximum rotation in degrees (default 20)
 * @param scaleFactor  Scale multiplier on hover (default 1.05)
 * @param perspective  CSS perspective distance in px (default 600)
 */
export function useCardTilt(maxTilt = 20, scaleFactor = 1.05, perspective = 600) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState<TiltState>(INITIAL);
  const frameRef = useRef<number>(0);
  const touchActiveRef = useRef(false);
  const lingerTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const reset = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    touchActiveRef.current = false;
    setTilt(INITIAL);
  }, []);

  const scheduleReset = useCallback(() => {
    clearTimeout(lingerTimerRef.current);
    lingerTimerRef.current = setTimeout(reset, TOUCH_LINGER_MS);
  }, [reset]);

  const updateTilt = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;

      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        // Normalise to -1 … 1 from centre
        const x = ((clientX - rect.left) / rect.width) * 2 - 1;
        const y = ((clientY - rect.top) / rect.height) * 2 - 1;

        setTilt({
          rotateX: -y * maxTilt,
          rotateY: x * maxTilt,
          scale: scaleFactor,
        });
      });
    },
    [maxTilt, scaleFactor],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') {
        clearTimeout(lingerTimerRef.current);
        touchActiveRef.current = true;
        updateTilt(e.clientX, e.clientY);
      }
    },
    [updateTilt],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // For touch, only update while finger is down
      if (e.pointerType === 'touch' && !touchActiveRef.current) return;
      updateTilt(e.clientX, e.clientY);
    },
    [updateTilt],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') {
        scheduleReset();
      }
    },
    [scheduleReset],
  );

  const handlePointerLeave = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') {
        // Finger left the element — schedule a delayed reset
        scheduleReset();
      } else {
        // Mouse/pen — reset immediately
        reset();
      }
    },
    [reset, scheduleReset],
  );

  const style: React.CSSProperties = {
    transform: `perspective(${perspective}px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg) scale3d(${tilt.scale}, ${tilt.scale}, ${tilt.scale})`,
    transition: tilt.scale === 1 ? 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)' : 'transform 0.1s ease-out',
    willChange: 'transform',
    touchAction: 'none',
  };

  /** Whether a touch interaction is currently active (finger down or lingering). */
  const isTouchActive = tilt.scale !== 1 && touchActiveRef.current;

  return {
    ref,
    style,
    isTouchActive,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerLeave: handlePointerLeave,
  } as const;
}
