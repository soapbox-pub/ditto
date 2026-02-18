import { useState, useRef, useCallback, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const THRESHOLD = 80; // px to pull before triggering refresh
const MAX_PULL = 120; // max visual pull distance
const RESISTANCE = 0.45; // damping factor for overscroll feel

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
}

export function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const canPull = useCallback(() => {
    // Only allow pull-to-refresh when we're scrolled to the top
    return window.scrollY <= 0;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isRefreshing) return;
    if (!canPull()) return;
    touchStartY.current = e.touches[0].clientY;
    isPulling.current = false;
  }, [isRefreshing, canPull]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;

    // Only start pulling if we're scrolled to top and dragging down
    if (diff > 0 && canPull()) {
      isPulling.current = true;
      // Apply resistance for a natural rubber-band feel
      const dampedDistance = Math.min(diff * RESISTANCE, MAX_PULL);
      setPullDistance(dampedDistance);
    } else {
      if (isPulling.current) {
        isPulling.current = false;
        setPullDistance(0);
      }
    }
  }, [isRefreshing, canPull]);

  const handleTouchEnd = useCallback(async () => {
    if (isRefreshing || !isPulling.current) {
      setPullDistance(0);
      return;
    }

    isPulling.current = false;

    if (pullDistance >= THRESHOLD * RESISTANCE) {
      // Triggered — show spinner at a settled position
      setIsRefreshing(true);
      setPullDistance(40);

      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      // Not enough pull — snap back
      setPullDistance(0);
    }
  }, [isRefreshing, pullDistance, onRefresh]);

  const progress = Math.min(pullDistance / (THRESHOLD * RESISTANCE), 1);
  const showIndicator = pullDistance > 4 || isRefreshing;

  return (
    <div
      ref={containerRef}
      className={className}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator — only visible on mobile */}
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-150 ease-out sidebar:hidden"
        style={{
          height: showIndicator ? `${pullDistance}px` : '0px',
          transition: isPulling.current ? 'none' : undefined,
        }}
      >
        <div
          className={cn(
            'flex items-center justify-center size-8 rounded-full bg-secondary/80 border border-border shadow-sm',
            'transition-transform duration-150',
          )}
          style={{
            opacity: progress,
            transform: isRefreshing
              ? 'scale(1)'
              : `scale(${0.5 + progress * 0.5}) rotate(${progress * 360}deg)`,
          }}
        >
          <Loader2
            className={cn(
              'size-4 text-primary',
              isRefreshing && 'animate-spin',
            )}
          />
        </div>
      </div>

      {/* Content */}
      {children}
    </div>
  );
}
