import { Link, useLocation } from 'react-router-dom';
import { Home, Bell, Search, Clapperboard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavTabProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}

function NavTab({ to, icon, label, active }: NavTabProps) {
  return (
    <Link
      to={to}
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  );
}

export function MobileBottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 flex items-center bg-background/95 backdrop-blur-md border-t border-border sidebar:hidden safe-area-bottom">
      <NavTab
        to="/"
        icon={<Home className="size-5" />}
        label="Home"
        active={location.pathname === '/'}
      />
      <NavTab
        to="/notifications"
        icon={<Bell className="size-5" />}
        label="Notifications"
        active={location.pathname === '/notifications'}
      />
      <NavTab
        to="/search"
        icon={<Search className="size-5" />}
        label="Search"
        active={location.pathname === '/search'}
      />
      <NavTab
        to="/vines"
        icon={<Clapperboard className="size-5" />}
        label="Vines"
        active={location.pathname === '/vines'}
      />
    </nav>
  );
}
