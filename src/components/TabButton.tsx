import { useRef, useLayoutEffect, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useSubHeaderBarHover } from '@/components/SubHeaderBar';

interface TabButtonProps {
  /** Tab display label. */
  label: string;
  /** Whether this tab is currently selected. */
  active: boolean;
  /** Called when the tab is clicked. Scroll-to-top is handled internally. */
  onClick: () => void;
  /** Disable the button (e.g. when logged out). */
  disabled?: boolean;
  /** Extra classes forwarded to the `<button>`. */
  className?: string;
  /** Optional children rendered inside the button instead of the label text. */
  children?: React.ReactNode;
}

/**
 * Shared sticky-tab button used across all feed / profile pages.
 *
 * Behaviour (see gitlab#109):
 * - Clicking the **active** tab smooth-scrolls to the top.
 * - Switching to a **different** tab resets scroll position instantly.
 */
export function TabButton({ label, active, onClick, disabled, className, children }: TabButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { onHover, onActive, scrollContainerRef } = useSubHeaderBarHover();

  const reportSlice = () => {
    const btn = ref.current;
    if (!btn) return;
    // Subtract scrollLeft so the position is in the visible (viewport) coordinate
    // space of the scroll container, matching the coordinate space of the SVG
    // hover/active indicators in SubHeaderBar.
    const scrollOffset = scrollContainerRef.current?.scrollLeft ?? 0;
    return { left: btn.offsetLeft - scrollOffset, width: btn.offsetWidth };
  };

  useLayoutEffect(() => {
    if (!active) return;
    const s = reportSlice();
    if (s) onActive(s);
    // Auto-scroll the active tab into view when the container overflows
    const btn = ref.current;
    const container = scrollContainerRef.current;
    if (btn && container) {
      const btnLeft = btn.offsetLeft;
      const btnRight = btnLeft + btn.offsetWidth;
      const viewLeft = container.scrollLeft;
      const viewRight = viewLeft + container.clientWidth;
      if (btnLeft < viewLeft) {
        container.scrollTo({ left: btnLeft - 8, behavior: 'smooth' });
      } else if (btnRight > viewRight) {
        container.scrollTo({ left: btnRight - container.clientWidth + 8, behavior: 'smooth' });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Re-report the active indicator position when the scroll container scrolls,
  // so the SVG clip-path stays aligned with the visually shifted tab.
  useEffect(() => {
    if (!active) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const s = reportSlice();
      if (s) onActive(s);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const handleMouseEnter = () => { const s = reportSlice(); if (s) onHover(s); };
  const handleMouseLeave = () => onHover(null);

  const handleClick = () => {
    if (active) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0 });
      onClick();
    }
  };

  return (
    <button
      ref={ref}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      disabled={disabled}
      className={cn(
        'flex-1 flex items-center justify-center py-1.5 text-sm font-medium transition-colors relative px-4 whitespace-nowrap',
        active ? 'text-foreground' : 'text-muted-foreground',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      {children ?? label}
    </button>
  );
}
