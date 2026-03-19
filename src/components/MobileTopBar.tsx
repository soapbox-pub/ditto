import { useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { DittoLogo } from '@/components/DittoLogo';
import { BarsStaggeredIcon } from '@/components/icons/BarsStaggeredIcon';

interface MobileTopBarProps {
  onAvatarClick: () => void;
}

export function MobileTopBar({ onAvatarClick }: MobileTopBarProps) {
  const location = useLocation();

  const handleLogoClick = useCallback((e: React.MouseEvent) => {
    if (location.pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md sidebar:hidden safe-area-top">
      <div className="flex items-center px-3 h-12">
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
