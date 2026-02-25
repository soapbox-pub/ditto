import { useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { DittoLogo } from '@/components/DittoLogo';

interface MobileTopBarProps {
  onMenuClick: () => void;
}

export function MobileTopBar({ onMenuClick }: MobileTopBarProps) {
  const location = useLocation();

  const handleLogoClick = useCallback((e: React.MouseEvent) => {
    if (location.pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border sidebar:hidden safe-area-top">
      <div className="flex items-center justify-between px-3 h-12">
        {/* Left: Logo / Home */}
        <Link to="/" onClick={handleLogoClick} className="shrink-0">
          <DittoLogo size={28} />
        </Link>

        {/* Right: hamburger menu */}
        <button
          onClick={onMenuClick}
          className="shrink-0 rounded-lg p-0.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background transition-colors hover:bg-secondary/60"
          aria-label="Open menu"
        >
          <Menu className="size-6" />
        </button>
      </div>
    </header>
  );
}
