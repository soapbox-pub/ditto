import { Suspense, useState, useMemo, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { LeftSidebar } from '@/components/LeftSidebar';
import { RightSidebar } from '@/components/RightSidebar';
import { MobileTopBar } from '@/components/MobileTopBar';
import { MobileDrawer } from '@/components/MobileDrawer';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { FloatingComposeButton } from '@/components/FloatingComposeButton';
import { CursorFireEffect } from '@/components/CursorFireEffect';
import { Skeleton } from '@/components/ui/skeleton';
import { DrawerContext, LayoutStore, LayoutStoreContext, NavHiddenContext, useLayoutSnapshot } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { cn } from '@/lib/utils';

/** Skeleton shown in the content area while a lazy page chunk is loading. */
function PageSkeleton() {
  return (
    <>
      {/* Main column skeleton — mirrors the Outlet wrapper's border + bg classes */}
      <main className="flex-1 min-w-0 min-h-screen sidebar:border-l sidebar:border-r border-border bg-background/85 sidebar:max-w-[600px]">
        {/* Header skeleton */}
        <div className="flex items-center gap-4 px-4 pt-4 pb-5">
          <Skeleton className="h-6 w-32" />
        </div>
        {/* Content skeletons */}
        <div className="space-y-4 px-4 min-h-dvh">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      </main>
      {/* Right sidebar skeleton — mirrors RightSidebar's container + widget card styling */}
      <aside className="w-[300px] shrink-0 hidden xl:flex flex-col sticky top-0 h-screen overflow-y-auto pt-2 pb-3 px-3">
        {/* Trends widget skeleton */}
        <section className="mb-6 bg-background/85 rounded-xl p-3 -mx-1">
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-4 w-14" />
          </div>
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-[28px] w-[50px] rounded" />
              </div>
            ))}
          </div>
        </section>
        {/* Hot Posts widget skeleton */}
        <section className="mb-6 bg-background/85 rounded-xl p-3 -mx-1">
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-5 rounded-full" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
            ))}
          </div>
        </section>
        {/* New Accounts widget skeleton */}
        <section className="mb-6 bg-background/85 rounded-xl p-3 -mx-1">
          <Skeleton className="h-6 w-28 mb-3" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </>
  );
}

/** Inner component that reads layout options from the context store. */
function MainLayoutInner() {
  const { rightSidebar, showFAB = false, fabKind = 1, fabHref, onFabClick, fabIcon, wrapperClassName, noOverscroll, noMaxWidth, scrollContainer, hasSubHeader, hideTopBar, hideBottomNav } = useLayoutSnapshot();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const { config } = useAppContext();
  const { hidden: navHidden } = useScrollDirection(scrollContainer);

  return (
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
        <div className="hidden sidebar:block">
          <LeftSidebar />
        </div>

        {/* Main content + right sidebar: inside Suspense so the left sidebar persists while lazy pages load */}
        <Suspense fallback={<PageSkeleton />}>
          {/* -mt-mobile-bar pulls content up behind the mobile top bar so the
              transparent SVG header arc and page content overlap seamlessly.
              The corresponding padding-top (set in CSS) prevents content from
              being hidden. This depends on MobileTopBar having a transparent /
              semi-transparent background — a solid top bar would obscure the
              content underneath. Only active below the sidebar breakpoint. */}
          <div className={cn("relative flex-1 min-w-0 sidebar:border-l sidebar:border-r border-border bg-background/85", !hideTopBar && "-mt-mobile-bar", !noMaxWidth && "sidebar:max-w-[600px]", !noOverscroll && "pb-overscroll")}>
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
          {rightSidebar !== null && (rightSidebar ?? <RightSidebar />)}
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
          style={navHidden ? { transform: `translateY(calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px)))` } : undefined}
        >
          <div className="pointer-events-auto">
            <FloatingComposeButton kind={fabKind} href={fabHref} onFabClick={onFabClick} icon={fabIcon} />
          </div>
        </div>
      )}
    </NavHiddenContext.Provider>
    </DrawerContext.Provider>
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
