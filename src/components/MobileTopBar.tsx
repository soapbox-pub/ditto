import { useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { DittoLogo } from '@/components/DittoLogo';
import { BarsStaggeredIcon } from '@/components/icons/BarsStaggeredIcon';

interface MobileTopBarProps {
  onAvatarClick: () => void;
  /** Whether to show the decorative arc below the header (when no sub-header exists). */
  showArc?: boolean;
}

export function MobileTopBar({ onAvatarClick, showArc }: MobileTopBarProps) {
  const location = useLocation();

  const handleLogoClick = useCallback((e: React.MouseEvent) => {
    if (location.pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-20 bg-background/80 sidebar:hidden safe-area-top">
      <div className="flex items-center px-3 h-10">
        {/* Left: hamburger menu icon */}
        <div className="flex items-center justify-center w-7 shrink-0">
          <button onClick={onAvatarClick} className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background text-muted-foreground hover:text-foreground transition-colors">
            <BarsStaggeredIcon className="size-5" />
          </button>
        </div>

      {/* Center: Ditto logo */}
      <div className="flex-1 flex items-center justify-center">
        <Link to="/" onClick={handleLogoClick}>
          <DittoLogo size={24} />
        </Link>
      </div>

        {/* Right: spacer for symmetry */}
        <div className="w-7 shrink-0" />
      </div>
      {/* Decorative arc — only shown when no sub-header provides its own */}
      {showArc && (
        <svg className="absolute left-0 right-0 top-full w-full pointer-events-none" viewBox="0 0 100 12" preserveAspectRatio="none" style={{ height: 20 }}>
          <path d="M0,0 Q50,12 100,0 Z" className="fill-background/80" />
        </svg>
      )}
    </header>
  );
}
