import { useCallback, useRef, useState } from 'react';

interface TiltState {
  rotateX: number;
  rotateY: number;
  scale: number;
}

const INITIAL: TiltState = { rotateX: 0, rotateY: 0, scale: 1 };

/**
 * Provides a 3D perspective-tilt effect driven by the mouse position
 * relative to the element. Returns a ref to attach to the container,
 * a style object for the `transform`, and pointer event handlers.
 *
 * @param maxTilt  Maximum rotation in degrees (default 20)
 * @param scaleFactor  Scale multiplier on hover (default 1.05)
 */
export function useCardTilt(maxTilt = 20, scaleFactor = 1.05) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState<TiltState>(INITIAL);
  const frameRef = useRef<number>(0);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;

      // Throttle to one update per animation frame
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        // Normalise to -1 … 1 from centre
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;

        setTilt({
          // Positive Y-mouse → negative rotateX  (tilts top away)
          rotateX: -y * maxTilt,
          // Positive X-mouse → positive rotateY  (tilts right side away)
          rotateY: x * maxTilt,
          scale: scaleFactor,
        });
      });
    },
    [maxTilt, scaleFactor],
  );

  const handlePointerLeave = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    setTilt(INITIAL);
  }, []);

  const style: React.CSSProperties = {
    transform: `perspective(600px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg) scale3d(${tilt.scale}, ${tilt.scale}, ${tilt.scale})`,
    transition: tilt.scale === 1 ? 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)' : 'transform 0.1s ease-out',
    willChange: 'transform',
  };

  return {
    ref,
    style,
    onPointerMove: handlePointerMove,
    onPointerLeave: handlePointerLeave,
  } as const;
}
