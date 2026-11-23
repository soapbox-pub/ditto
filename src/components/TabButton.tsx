import { useCallback, useRef, useLayoutEffect } from 'react';
import { cn } from '@/lib/utils';
import type { TabIcon } from '@/lib/tabIcons';
import { scrollWithoutMovingChrome } from '@/hooks/useScrollDirection';
import { selectionChanged } from '@/lib/haptics';
import { useSubHeaderBarHover, useActiveTabIndicator } from '@/components/SubHeaderBarContext';

interface TabButtonProps extends Omit<React.ComponentPropsWithRef<'button'>, 'onClick' | 'children'> {
  /** Tab display label. */
  label: string;
  /** Whether this tab is currently selected. */
  active: boolean;
  /** Called when the tab is clicked. Scroll-to-top is handled internally. */
  onClick: () => void;
  /** Called instead of scrolling to the top when the active tab is clicked. */
  onActiveClick?: () => void;
  /** Disable the button (e.g. when logged out). */
  disabled?: boolean;
  /** Extra classes forwarded to the `<button>`. */
  className?: string;
  /** Icon shown before the label while the tab is active. */
  icon?: TabIcon;
  /** Optional children rendered inside the button instead of the label text. */
  children?: React.ReactNode;
}

/**
 * Shared sticky-tab button used across all feed / profile pages.
 *
 * Behaviour (see gitlab#109):
 * - Clicking the **active** tab smooth-scrolls to the top (or calls
 *   `onActiveClick`).
 * - Switching to a **different** tab jumps to the start of its content,
 *   keeping a stuck tab bar stuck.
 *
 * Other button props and the ref are forwarded, so a tab can be a menu trigger.
 */
export function TabButton({ label, active, onClick, onActiveClick, disabled, className, icon: Icon, children, ref: forwardedRef, ...rest }: TabButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  // Stable, so the button isn't detached and reattached on every render.
  const setRef = useCallback((node: HTMLButtonElement | null) => {
    ref.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);
  const { onHover, scrollContainerRef, getStuckScrollY } = useSubHeaderBarHover();
  const { reportSlice } = useActiveTabIndicator(active, ref);

  // Auto-scroll the active tab into view when the container overflows
  useLayoutEffect(() => {
    if (!active) return;
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

  const handleMouseEnter = () => { const s = reportSlice(); if (s) onHover(s); };
  const handleMouseLeave = () => onHover(null);

  const handleClick = () => {
    // Clear hover highlight immediately — on mobile, mouseleave never fires
    // after a tap, so the hover arc would otherwise stay visible.
    onHover(null);

    if (active) {
      if (onActiveClick) onActiveClick();
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // The new tab starts at its top, with the bar where it is: still stuck
      // if it was (not back up at the top of the page, above a profile's
      // header), and left alone if the page above it is in view.
      selectionChanged();
      const stuckY = getStuckScrollY();
      if (stuckY !== null) scrollWithoutMovingChrome(stuckY);
      onClick();
    }
  };

  return (
    <button
      type="button"
      {...rest}
      ref={setRef}
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
      {children ?? (Icon && active ? (
        <span className="flex items-center justify-center gap-1.5">
          <Icon className="size-4 shrink-0" />
          {label}
        </span>
      ) : label)}
    </button>
  );
}
