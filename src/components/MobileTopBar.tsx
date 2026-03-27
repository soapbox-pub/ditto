import { useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { DittoLogo } from '@/components/DittoLogo';
import { BarsStaggeredIcon } from '@/components/icons/BarsStaggeredIcon';
import { ArcBackground, ARC_OVERHANG_PX } from '@/components/ArcBackground';

/** Transform style applied when the top bar is hidden (scrolled away). */
const hiddenStyle: React.CSSProperties = {
  transform: `translateY(calc(-100% - ${ARC_OVERHANG_PX}px))`,
};

interface MobileTopBarProps {
  onAvatarClick: () => void;
  /** When true, a SubHeaderBar with an arc follows immediately below — skip the arc here to avoid doubling up. */
  hasSubHeader?: boolean;
  /** Whether the top bar should be hidden (scrolled away). */
  hidden?: boolean;
}

export function MobileTopBar({ onAvatarClick, hasSubHeader, hidden }: MobileTopBarProps) {
  const location = useLocation();

  const handleLogoClick = useCallback((e: React.MouseEvent) => {
    if (location.pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-20 sidebar:hidden safe-area-top will-change-transform transition-transform duration-300 ease-in-out"
      style={hidden ? hiddenStyle : undefined}
    >
      <ArcBackground variant={hasSubHeader ? 'rect' : 'down'} />
      <div className="relative flex items-center px-3 h-10">
        {/* Left: hamburger menu icon */}
        <div className="flex items-center justify-center w-7 shrink-0">
          <button onClick={onAvatarClick} className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background text-muted-foreground hover:text-foreground transition-colors">
            <BarsStaggeredIcon className="size-5" />
          </button>
        </div>

        {/* Center: Ditto logo */}
        <div className="flex-1 flex items-center justify-center">
          <Link to="/" onClick={handleLogoClick}>
            <DittoLogo size={28} />
          </Link>
        </div>

        {/* Right: spacer for symmetry */}
        <div className="w-7 shrink-0" />
      </div>
    </header>
  );
}
