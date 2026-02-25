import { useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Search } from 'lucide-react';
import { DittoLogo } from '@/components/DittoLogo';

interface MobileTopBarProps {
  onMenuClick: () => void;
}

export function MobileTopBar({ onMenuClick }: MobileTopBarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogoClick = useCallback((e: React.MouseEvent) => {
    if (location.pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border sidebar:hidden safe-area-top">
      <div className="flex items-center px-3 h-12">
        {/* Left: hamburger menu */}
        <div className="flex items-center justify-center w-7 shrink-0">
          <button
            onClick={onMenuClick}
            className="rounded-lg p-0.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background transition-colors hover:bg-secondary/60"
            aria-label="Open menu"
          >
            <Menu className="size-6" />
          </button>
        </div>

        {/* Center: Ditto logo */}
        <div className="flex-1 flex items-center justify-center">
          <Link to="/" onClick={handleLogoClick}>
            <DittoLogo size={28} />
          </Link>
        </div>

        {/* Right: search icon */}
        <div className="flex items-center justify-center w-7 shrink-0">
          <button
            onClick={() => navigate('/search')}
            className="rounded-lg p-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background transition-colors hover:bg-secondary/60"
            aria-label="Search"
          >
            <Search className="size-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
