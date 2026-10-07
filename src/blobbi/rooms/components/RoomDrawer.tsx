/**
 * RoomDrawer — the room's tab bar and the panel that pulls down with it.
 *
 * The panel sits just above the tab bar, out of view above the room. Opening
 * slides both down together, so the tabs ride on the bottom edge of the
 * panel like the pull of a blind. A tap outside, Escape, or a swipe up on
 * the tabs closes it. Keeps its last content mounted while it slides away.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { cn } from '@/lib/utils';

import { useDrawerSwipe } from '../hooks/useDrawerSwipe';

interface RoomDrawerProps {
  open: boolean;
  onClose: () => void;
  /** The tab bar. */
  bar: React.ReactNode;
  /** Panel content for the open tab. */
  children: React.ReactNode;
}

export function RoomDrawer({ open, onClose, bar, children }: RoomDrawerProps) {
  const intl = useIntl();
  // Swipe state lives here so following the finger re-renders only the drawer
  const swipe = useDrawerSwipe(open, onClose);
  const panelRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the last content while sliding closed
  const lastContent = useRef(children);
  useEffect(() => {
    if (open) lastContent.current = children;
  });
  const content = open ? children : lastContent.current;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const dragging = swipe.offset !== 0;
  const shift = open ? Math.max(0, height + swipe.offset) : 0;

  return (
    <>
      {/* Tap away to close. Fixed inside the room shell, which contains it. */}
      <div
        className={cn(
          'fixed inset-0 -z-10 bg-black/25 transition-opacity duration-300 motion-reduce:transition-none',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
        aria-hidden
      />

      <div
        className={cn(
          'relative will-change-transform',
          !dragging && 'transition-transform duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        )}
        style={{ transform: `translateY(${shift}px)` }}
      >
        {/* Panel: above the tab bar, out of view until it slides down */}
        <div
          ref={panelRef}
          role="region"
          aria-label={intl.formatMessage({ id: 'blobbiRoom.drawer.label', defaultMessage: 'Blobbi menu' })}
          aria-hidden={!open}
          inert={!open}
          className="absolute bottom-full inset-x-0 flex flex-col max-h-[min(68dvh,600px)] bg-background/90 backdrop-blur-md"
        >
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="max-w-2xl mx-auto w-full pt-[1em] pb-[0.25em]">
              {content}
            </div>
          </div>
        </div>

        {/* The tab bar rides on the panel's bottom edge; swipe it up to close */}
        <div className="relative touch-pan-x" {...swipe.handlers}>
          {bar}
          {open && (
            <div className="pointer-events-none absolute inset-x-0 -bottom-[0.9em] flex justify-center" aria-hidden>
              <span className="h-[0.3em] w-[2.5em] rounded-full bg-foreground/25" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
