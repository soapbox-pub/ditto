import { useState, useRef, useEffect, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { impactMedium } from '@/lib/haptics';

const THRESHOLD = 80; // raw px before triggering
const MAX_PULL = 120; // max visual distance (after damping)
const RESISTANCE = 0.45; // rubber-band damping

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
}

export function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startY = useRef(0);
  const pulling = useRef(false);
  const busy = useRef(false);
  const currentPull = useRef(0); // mirror of pullDistance for sync reads in handlers
  const containerRef = useRef<HTMLDivElement>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Disable native browser pull-to-refresh only while this component is mounted
  useEffect(() => {
    const prev = document.documentElement.style.overscrollBehaviorY;
    document.documentElement.style.overscrollBehaviorY = 'contain';
    return () => {
      document.documentElement.style.overscrollBehaviorY = prev;
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const atTop = () => window.scrollY <= 0;

    function onStart(e: TouchEvent) {
      if (busy.current || !atTop()) return;
      startY.current = e.touches[0].clientY;
      pulling.current = false;
    }

    function onMove(e: TouchEvent) {
      if (busy.current) return;
      const diff = e.touches[0].clientY - startY.current;

      if (diff > 0 && atTop()) {
        e.preventDefault(); // block native browser pull-to-refresh
        pulling.current = true;
        const d = Math.min(diff * RESISTANCE, MAX_PULL);
        currentPull.current = d;
        setPullDistance(d);
      } else if (pulling.current) {
        pulling.current = false;
        currentPull.current = 0;
        setPullDistance(0);
      }
    }

    async function onEnd() {
      if (busy.current || !pulling.current) {
        pulling.current = false;
        currentPull.current = 0;
        setPullDistance(0);
        return;
      }

      pulling.current = false;
      const reached = currentPull.current >= THRESHOLD * RESISTANCE;

      if (reached) {
        impactMedium();
        busy.current = true;
        currentPull.current = 40;
        setPullDistance(40);
        setRefreshing(true);

        try {
          await onRefreshRef.current();
        } finally {
          busy.current = false;
          setRefreshing(false);
          currentPull.current = 0;
          setPullDistance(0);
        }
      } else {
        currentPull.current = 0;
        setPullDistance(0);
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, []);

  const progress = Math.min(pullDistance / (THRESHOLD * RESISTANCE), 1);
  const visible = pullDistance > 4 || refreshing;

  return (
    <div ref={containerRef} className={className}>
      {/* Pull indicator — mobile only */}
      <div
        className="flex items-center justify-center overflow-hidden sidebar:hidden"
        style={{
          height: visible ? `${pullDistance}px` : '0px',
          transition: pulling.current ? 'none' : 'height 150ms ease-out',
        }}
      >
        <div
          className="flex items-center justify-center size-8 rounded-full bg-secondary/80 border border-border shadow-sm"
          style={{
            opacity: progress,
            transform: refreshing
              ? 'scale(1)'
              : `scale(${0.5 + progress * 0.5}) rotate(${progress * 360}deg)`,
            transition: 'transform 150ms ease-out',
          }}
        >
          <Loader2
            className={cn(
              'size-4 text-primary',
              refreshing && 'animate-spin',
            )}
          />
        </div>
      </div>

      {children}
    </div>
  );
}
