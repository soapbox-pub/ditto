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
import { LayoutStore, LayoutStoreContext, useLayoutSnapshot } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
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
  const { rightSidebar, showFAB = false, fabKind = 1, fabHref, onFabClick, fabIcon, wrapperClassName, noOverscroll, noMaxWidth } = useLayoutSnapshot();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { config } = useAppContext();

  return (
    <>
      {/* Magic Mouse fire particle overlay */}
      {config.magicMouse && <CursorFireEffect />}

      {/* Mobile top bar - only on small screens */}
      <MobileTopBar onAvatarClick={() => setDrawerOpen(true)} />

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
          <div className={cn("relative flex-1 min-w-0 sidebar:border-l border-r border-border bg-background/85", !noMaxWidth && "sidebar:max-w-[600px]", !noOverscroll && "pb-overscroll")}>
            <Outlet />
            {showFAB && (
              <div className="sticky bottom-fab sidebar:bottom-6 z-30 pointer-events-none flex justify-end pr-6">
                <div className="pointer-events-auto">
                  <FloatingComposeButton kind={fabKind} href={fabHref} onFabClick={onFabClick} icon={fabIcon} />
                </div>
              </div>
            )}
          </div>
          {rightSidebar !== null && (rightSidebar ?? <RightSidebar />)}
        </Suspense>
      </div>

      {/* Mobile bottom nav - only on small screens, slides out on scroll */}
      <MobileBottomNav />
    </>
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
