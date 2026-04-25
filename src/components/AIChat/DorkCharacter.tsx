import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

// ─── Dork's intro messages ───────────────────────────────────────────────────

const DORK_MESSAGES = [
  "Oh! A new face. I'm Dork. Nice to meet you.",
  "You're about to create a buddy — your very own AI with an identity and a personality you design.",
  "I'll walk you through it. Let's get started!",
];

// ─── Types ────────────────────────────────────────────────────────────────────

type OverlayState = 'hidden' | 'entering' | 'message' | 'exiting';

interface DorkOverlayProps {
  /** Whether the overlay should be visible. */
  open: boolean;
  /** Called when Dork finishes his dialogue and the overlay should close. */
  onDismiss: () => void;
}

// Preload Dork images (one per dialogue step)
const DORK_IMAGES = ['/dork1.webp', '/dork2.webp', '/dork3.webp'];
DORK_IMAGES.forEach((src) => {
  const img = new Image();
  img.src = src;
});

// ─── Component ────────────────────────────────────────────────────────────────

export function DorkOverlay({ open, onDismiss }: DorkOverlayProps) {
  const [state, setState] = useState<OverlayState>('hidden');
  const [messageIndex, setMessageIndex] = useState(0);
  const [messageVisible, setMessageVisible] = useState(false);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Managed timeout that auto-cleans on unmount
  const safeTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

  // Clean up all pending timers on unmount
  useEffect(() => {
    return () => {
      for (const id of timersRef.current) clearTimeout(id);
      timersRef.current.clear();
    };
  }, []);

  // ── Shared exit sequence ──
  const dismiss = useCallback(() => {
    setState('exiting');
    safeTimeout(() => {
      setState('hidden');
      onDismiss();
    }, 600);
  }, [onDismiss, safeTimeout]);

  // ── Open → entrance sequence ──
  useEffect(() => {
    if (open && state === 'hidden') {
      setState('entering');
      safeTimeout(() => setState('message'), 800);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fade in message when state or index changes ──
  useEffect(() => {
    if (state !== 'message') {
      setMessageVisible(false);
      return;
    }
    const id = safeTimeout(() => setMessageVisible(true), 100);
    return () => clearTimeout(id);
  }, [state, messageIndex, safeTimeout]);

  // ── Advance or dismiss ──
  const handleTap = useCallback(() => {
    if (state === 'entering') return;

    if (state === 'message') {
      if (messageIndex < DORK_MESSAGES.length - 1) {
        setMessageVisible(false);
        safeTimeout(() => setMessageIndex((i) => i + 1), 300);
      } else {
        dismiss();
      }
    }
  }, [state, messageIndex, dismiss, safeTimeout]);

  const isActive = state === 'message';

  if (state === 'hidden' && !open) return null;

  return createPortal(
    <>
      <style>{`
        @keyframes dork-enter-up {
          0% { opacity: 0; transform: translateY(40px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes dork-wave {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-8deg); }
          75% { transform: rotate(8deg); }
        }
        @keyframes dork-bubble-in {
          0% { opacity: 0; transform: translateY(8px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .dork-enter-up { animation: dork-enter-up 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        .dork-wave { animation: dork-wave 0.8s ease-in-out; }
        .dork-bubble-enter { animation: dork-bubble-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
      `}</style>

      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-[100] transition-opacity duration-700',
          isActive ? 'opacity-100' : state === 'entering' ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.92) 100%)' }}
        onClick={dismiss}
      />

      {/* Character + bubble — bottom-anchored column, image in fixed-size box */}
      {state !== 'hidden' && (
        <div
          className="fixed inset-0 z-[101] select-none cursor-pointer flex flex-col items-center justify-end"
          style={{ paddingBottom: 'calc(var(--bottom-nav-height, 2.75rem) + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 1rem)' }}
          onClick={handleTap}
        >
          {/* Speech bubble — parallelogram for comic feel */}
          <div className="flex justify-center px-4 mb-4 pointer-events-none">
            {isActive && (
              <div
                className={cn(
                  'relative max-w-sm transition-opacity duration-300 pointer-events-auto',
                  messageVisible ? 'dork-bubble-enter' : 'opacity-0',
                )}
              >
                {/* Skewed background — sharp corners, stronger angle */}
                <div className="absolute inset-0 bg-primary -skew-x-6 shadow-2xl" />

                {/* Content — counter-skew to keep text straight */}
                <div className="relative px-6 py-4">
                  <p className="text-sm text-primary-foreground leading-relaxed text-center font-medium">
                    {DORK_MESSAGES[messageIndex]}
                  </p>
                </div>

                {/* Tail — skewed triangle pointing down */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 -skew-x-6">
                  <div className="w-4 h-4 rotate-45 bg-primary" />
                </div>
              </div>
            )}
          </div>

          {/* Dork image — fixed-size box so bubble never shifts */}
          <div className="w-56 h-56 sm:w-64 sm:h-64 md:w-72 md:h-72 shrink-0 flex items-end justify-center">
            <div
              className={cn(
                'transition-opacity duration-500',
                state === 'entering' && 'dork-enter-up',
                state === 'exiting' && 'opacity-0',
                isActive && 'opacity-100',
              )}
            >
              <div className={cn(state === 'entering' && 'dork-wave')}>
                <img
                  src={DORK_IMAGES[messageIndex] ?? DORK_IMAGES[0]}
                  alt="Dork"
                  className="w-56 sm:w-64 md:w-72 h-auto drop-shadow-2xl"
                  draggable={false}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
