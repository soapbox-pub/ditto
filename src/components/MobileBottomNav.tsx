import { Link, useLocation } from 'react-router-dom';
import { Home, Bell, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface NavTabProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  showIndicator?: boolean;
}

function NavTab({ to, icon, label, active, showIndicator }: NavTabProps) {
  return (
    <Link
      to={to}
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors relative',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
      {showIndicator && (
        <span className="absolute top-1.5 left-1/2 translate-x-1 size-2 bg-primary rounded-full" />
      )}
    </Link>
  );
}

export function MobileBottomNav() {
  const location = useLocation();
  const { user } = useCurrentUser();
  const { hasUnread } = useNotifications();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 flex items-center bg-background/95 backdrop-blur-md border-t border-border sidebar:hidden safe-area-bottom">
      <NavTab
        to="/"
        icon={<Home className="size-5" />}
        label="Home"
        active={location.pathname === '/'}
      />
      {user && (
        <NavTab
          to="/notifications"
          icon={<Bell className="size-5" />}
          label="Notifications"
          active={location.pathname === '/notifications'}
          showIndicator={hasUnread}
        />
      )}
      <NavTab
        to="/search"
        icon={<Search className="size-5" />}
        label="Search"
        active={location.pathname === '/search'}
      />
    </nav>
  );
}
