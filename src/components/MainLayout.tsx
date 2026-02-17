import { useState } from 'react';
import { LeftSidebar } from '@/components/LeftSidebar';
import { RightSidebar } from '@/components/RightSidebar';
import { MobileTopBar } from '@/components/MobileTopBar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { MobileDrawer } from '@/components/MobileDrawer';
import { FloatingComposeButton } from '@/components/FloatingComposeButton';

interface MainLayoutProps {
  children: React.ReactNode;
  /** Hide the mobile top bar (e.g., when a page has its own sticky header) */
  hideMobileTopBar?: boolean;
  /** Optional custom right sidebar to replace the default one */
  rightSidebar?: React.ReactNode;
}

export function MainLayout({ children, hideMobileTopBar, rightSidebar }: MainLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar - only on small screens */}
      {!hideMobileTopBar && (
        <MobileTopBar onAvatarClick={() => setDrawerOpen(true)} />
      )}

      {/* Mobile drawer */}
      <MobileDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />

      {/* Main layout - three column on desktop */}
      <div className="flex justify-center min-h-screen">
        {/* Desktop left sidebar - hidden below sidebar breakpoint */}
        <div className="hidden sidebar:block">
          <LeftSidebar />
        </div>

        {/* Main content area */}
        {children}

        {/* Desktop right sidebar - handled internally with hidden lg:block */}
        {rightSidebar ?? <RightSidebar />}
      </div>

      {/* Mobile bottom nav - only on small screens */}
      <MobileBottomNav />

      {/* Mobile floating compose button */}
      <FloatingComposeButton />

      {/* Bottom padding spacer for mobile bottom nav */}
      <div className="h-16 sidebar:hidden" />
    </>
  );
}
