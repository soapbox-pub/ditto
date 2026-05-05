import { Suspense, useState, useMemo, useCallback, useRef, lazy } from 'react';
import { Outlet } from 'react-router-dom';
import { LeftSidebar } from '@/components/LeftSidebar';
import { MobileTopBar } from '@/components/MobileTopBar';
import { MobileDrawer } from '@/components/MobileDrawer';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { FloatingComposeButton } from '@/components/FloatingComposeButton';
import { CursorFireEffect } from '@/components/CursorFireEffect';
import { CenterColumnContext, DrawerContext, LayoutStore, LayoutStoreContext, NavHiddenContext, useLayoutSnapshot } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { cn } from '@/lib/utils';

const WidgetSidebar = lazy(() => import('@/components/WidgetSidebar').then((m) => ({ default: m.WidgetSidebar })));

/** Neutral fallback shown in the content area while a lazy page chunk is loading. */
function PageSkeleton() {
  return (
    <>
      {/* Main column placeholder — mirrors the Outlet wrapper's border + bg classes */}
      <main className="flex-1 min-w-0 min-h-screen sidebar:border-l sidebar:border-r border-border bg-background/85 sidebar:max-w-[600px] flex items-center justify-center">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-[2.5px] border-primary/20" />
          <div className="absolute inset-0 rounded-full border-[2.5px] border-transparent border-t-primary animate-spin" />
        </div>
      </main>
      {/* Right sidebar placeholder — preserves layout width */}
      <div className="w-1/4 max-w-[300px] shrink-0 hidden lg:block" />
    </>
  );
}

/** Inner component that reads layout options from the context store. */
function MainLayoutInner() {
  const { rightSidebar, showFAB = false, fabKind = 1, fabHref, onFabClick, fabIcon, wrapperClassName, noOverscroll, noMaxWidth, scrollContainer, hasSubHeader, hideTopBar, hideBottomNav } = useLayoutSnapshot();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const centerColumnRef = useRef<HTMLDivElement>(null);
  const [centerColumnEl, setCenterColumnEl] = useState<HTMLElement | null>(null);
  const { config } = useAppContext();
  const { hidden: navHidden } = useScrollDirection(scrollContainer);
  return (
    <CenterColumnContext.Provider value={centerColumnEl}>
    <DrawerContext.Provider value={openDrawer}>
    <NavHiddenContext.Provider value={navHidden}>
      {/* Magic Mouse fire particle overlay */}
      {config.magicMouse && <CursorFireEffect />}

      {/* Mobile top bar - only on small screens, hidden when page requests immersive mode */}
      {!hideTopBar && <MobileTopBar onAvatarClick={() => setDrawerOpen(true)} hasSubHeader={hasSubHeader} />}

      {/* Mobile drawer */}
      <MobileDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />

      {/* Main layout - three column on desktop */}
      <div className={cn("flex justify-center mx-auto max-w-[1200px]", wrapperClassName)}>
        {/* Desktop left sidebar - hidden below sidebar breakpoint */}
        <LeftSidebar />

        {/* Main content + right sidebar: inside Suspense so the left sidebar persists while lazy pages load */}
        <Suspense fallback={<PageSkeleton />}>
          {/* -mt-mobile-bar pulls content up behind the mobile top bar so the
              transparent SVG header arc and page content overlap seamlessly.
              The corresponding padding-top (set in CSS) prevents content from
              being hidden. This depends on MobileTopBar having a transparent /
              semi-transparent background — a solid top bar would obscure the
              content underneath. Only active below the sidebar breakpoint. */}
          <div
            ref={(el) => { centerColumnRef.current = el; setCenterColumnEl(el); }}
            className={cn("relative z-0 flex-1 min-w-0 sidebar:border-l sidebar:border-r border-border bg-background/85", !hideTopBar && "-mt-mobile-bar", !noMaxWidth && "sidebar:max-w-[600px]", !noOverscroll && "pb-overscroll")}
          >
            <Outlet />

            {/* Desktop FAB — sticky within the feed column so it stays
                anchored to the bottom-right of the content area, not the
                viewport. Hidden below the sidebar breakpoint where the
                mobile fixed FAB takes over. */}
            {showFAB && (
              <div className="hidden sidebar:block sticky bottom-6 z-30 pointer-events-none">
                <div className="flex justify-end pr-4">
                  <div className="pointer-events-auto">
                    <FloatingComposeButton kind={fabKind} href={fabHref} onFabClick={onFabClick} icon={fabIcon} />
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* Right sidebar — render page-provided sidebar, or the widget sidebar */}
          {rightSidebar ?? <Suspense fallback={<div className="w-1/4 max-w-[300px] shrink-0 hidden lg:block" />}><WidgetSidebar /></Suspense>}
        </Suspense>
      </div>

      {/* Mobile bottom nav - only on small screens, slides out on scroll */}
      {!hideBottomNav && <MobileBottomNav />}

      {/* Mobile FAB — fixed to viewport, hidden on desktop where the
          in-column sticky FAB (above) takes over. Mirrors bottom nav
          hide/show transition on scroll. */}
      {showFAB && (
        <div
          className="fixed bottom-fab right-6 z-30 pointer-events-none transition-transform duration-300 ease-in-out sidebar:hidden"
          style={navHidden ? { transform: `translateY(calc(var(--bottom-nav-height) + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))))` } : undefined}
        >
          <div className="pointer-events-auto">
            <FloatingComposeButton kind={fabKind} href={fabHref} onFabClick={onFabClick} icon={fabIcon} />
          </div>
        </div>
      )}
    </NavHiddenContext.Provider>
    </DrawerContext.Provider>
    </CenterColumnContext.Provider>
  );
}

/**
 * Persistent layout shell rendered once by the router.
 * Provides a LayoutStore so child pages can configure layout options
 * (e.g. showFAB, custom right sidebar) via the `useLayoutOptions` hook.
 */
export function MainLayout() {
  const store = useMemo(() => new LayoutStore(), []);

  return (
    <LayoutStoreContext.Provider value={store}>
      <MainLayoutInner />
    </LayoutStoreContext.Provider>
  );
}
