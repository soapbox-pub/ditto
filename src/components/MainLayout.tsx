import { useState } from 'react';
import { LeftSidebar } from '@/components/LeftSidebar';
import { RightSidebar } from '@/components/RightSidebar';
import { MobileTopBar } from '@/components/MobileTopBar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { MobileDrawer } from '@/components/MobileDrawer';
import { FloatingComposeButton } from '@/components/FloatingComposeButton';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
  children: React.ReactNode;
  /** Optional custom right sidebar to replace the default one */
  rightSidebar?: React.ReactNode;
  /** Whether to show the floating compose button (default: false) */
  showFAB?: boolean;
  /** Skip the bottom nav spacer (for pages that handle their own bottom padding) */
  noBottomSpacer?: boolean;
  /** Additional classes for the wrapper div (e.g. to override min-h-screen) */
  wrapperClassName?: string;
}

export function MainLayout({ children, rightSidebar, showFAB = false, noBottomSpacer = false, wrapperClassName }: MainLayoutProps) {
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

        {/* Main content area */}
        {children}

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
