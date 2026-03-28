import { Suspense, useState, useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import { LeftSidebar } from '@/components/LeftSidebar';
import { RightSidebar } from '@/components/RightSidebar';
import { MobileTopBar } from '@/components/MobileTopBar';
import { MobileDrawer } from '@/components/MobileDrawer';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { FloatingComposeButton } from '@/components/FloatingComposeButton';
import { CursorFireEffect } from '@/components/CursorFireEffect';
import { Skeleton } from '@/components/ui/skeleton';
import { LayoutStore, LayoutStoreContext, NavHiddenContext, useLayoutSnapshot } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { cn } from '@/lib/utils';

/** Skeleton shown in the content area while a lazy page chunk is loading. */
function PageSkeleton() {
  return (
    <>
      {/* Main column skeleton */}
      <main className="flex-1 min-w-0 min-h-screen">
        {/* Header skeleton */}
        <div className="flex items-center gap-4 px-4 pt-4 pb-5">
          <Skeleton className="h-6 w-32" />
        </div>
        {/* Content skeletons */}
        <div className="space-y-4 px-4">
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
      {/* Right sidebar skeleton */}
      <aside className="w-[300px] shrink-0 hidden xl:flex flex-col sticky top-0 h-screen pt-5 pb-3 px-5">
        <div className="space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-6 w-24" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-8 w-12" />
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}

/** Inner component that reads layout options from the context store. */
function MainLayoutInner() {
  const { rightSidebar, showFAB = false, fabKind = 1, fabHref, onFabClick, fabIcon, wrapperClassName, noOverscroll, noMaxWidth, scrollContainer, hasSubHeader } = useLayoutSnapshot();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { config } = useAppContext();
  const { hidden: navHidden } = useScrollDirection(scrollContainer);

  return (
    <NavHiddenContext.Provider value={navHidden}>
      {/* Magic Mouse fire particle overlay */}
      {config.magicMouse && <CursorFireEffect />}

      {/* Mobile top bar - only on small screens */}
      <MobileTopBar onAvatarClick={() => setDrawerOpen(true)} hasSubHeader={hasSubHeader} />

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
          <div className={cn("relative flex-1 min-w-0 sidebar:border-l sidebar:border-r border-border bg-background/85 -mt-mobile-bar", !noMaxWidth && "sidebar:max-w-[600px]", !noOverscroll && "pb-overscroll")}>
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
      <MobileBottomNav />

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
