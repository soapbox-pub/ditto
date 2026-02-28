import { useCallback, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Search } from 'lucide-react';
import { PlanetIcon } from '@/components/icons/PlanetIcon';
import { cn } from '@/lib/utils';
import { useHasUnreadNotifications } from '@/hooks/useHasUnreadNotifications';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { MobileSearchSheet } from '@/components/MobileSearchSheet';

export function MobileBottomNav() {
  const location = useLocation();
  const { user } = useCurrentUser();
  const hasUnread = useHasUnreadNotifications();

  const [searchOpen, setSearchOpen] = useState(false);

  const handleHomeClick = useCallback((e: React.MouseEvent) => {
    setSearchOpen(false);
    if (location.pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  const handleNotificationsClick = useCallback(() => {
    setSearchOpen(false);
  }, []);

  const handleSearchClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setSearchOpen((v) => !v);
  }, []);

  return (
    <>
      <MobileSearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} />

      <nav className="fixed bottom-0 left-0 right-0 z-50 h-14 flex items-center bg-background/80 backdrop-blur-md border-t border-border sidebar:hidden safe-area-bottom">

        <Link
          to="/"
          onClick={handleHomeClick}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
            location.pathname === '/' ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          <PlanetIcon className="size-5" />
          <span className="text-[10px] font-medium">Feed</span>
        </Link>

        {user && (
          <Link
            to="/notifications"
            onClick={handleNotificationsClick}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
              location.pathname === '/notifications' ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <span className="relative">
              <Bell className="size-5" />
              {hasUnread && (
                <span className="absolute -top-1 right-0 size-2 bg-primary rounded-full" />
              )}
            </span>
            <span className="text-[10px] font-medium">Notifications</span>
          </Link>
        )}

        <button
          onClick={handleSearchClick}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
            searchOpen ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          <Search className="size-5" />
          <span className="text-[10px] font-medium">Search</span>
        </button>

      </nav>
    </>
  );
}
