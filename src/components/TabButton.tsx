import { useRef, useLayoutEffect } from 'react';
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
  /** Override the default indicator bar classes. */
  indicatorClassName?: string;
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
export function TabButton({ label, active, onClick, disabled, className, indicatorClassName, children }: TabButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { onHover, onActive } = useSubHeaderBarHover();

  const reportSlice = () => {
    const btn = ref.current;
    if (!btn) return;
    return { left: btn.offsetLeft, width: btn.offsetWidth };
  };

  useLayoutEffect(() => {
    if (!active) return;
    const s = reportSlice();
    if (s) onActive(s);
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
        'flex-1 py-1.5 text-center text-sm font-medium transition-colors relative px-4 whitespace-nowrap',
        active ? 'text-foreground' : 'text-muted-foreground',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      {children ?? label}
    </button>
  );
}
