import { useState, useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import { LeftSidebar } from '@/components/LeftSidebar';
import { RightSidebar } from '@/components/RightSidebar';
import { MobileTopBar } from '@/components/MobileTopBar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { MobileDrawer } from '@/components/MobileDrawer';
import { FloatingComposeButton } from '@/components/FloatingComposeButton';
import { LayoutStore, LayoutStoreContext, useLayoutSnapshot } from '@/contexts/LayoutContext';
import { cn } from '@/lib/utils';

/** Inner component that reads layout options from the context store. */
function MainLayoutInner() {
  const { rightSidebar, showFAB = false, noBottomSpacer = false, wrapperClassName } = useLayoutSnapshot();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar - only on small screens */}
      <MobileTopBar onAvatarClick={() => setDrawerOpen(true)} />

      {/* Mobile drawer */}
      <MobileDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />

      {/* Main layout - three column on desktop */}
      <div className={cn("flex justify-center min-h-screen mx-auto max-w-[1200px]", wrapperClassName)}>
        {/* Desktop left sidebar - hidden below sidebar breakpoint */}
        <div className="hidden sidebar:block">
          <LeftSidebar />
        </div>

        {/* Main content area - swapped by the router */}
        <Outlet />

        {/* Desktop right sidebar - handled internally with hidden lg:block */}
        {rightSidebar ?? <RightSidebar />}
      </div>

      {/* Mobile bottom nav - only on small screens */}
      <MobileBottomNav />

      {/* Mobile floating compose button - only on feed page */}
      {showFAB && <FloatingComposeButton />}

      {/* Bottom padding spacer for mobile bottom nav */}
      {!noBottomSpacer && <div className="h-16 sidebar:hidden" />}
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
