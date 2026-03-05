import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Search } from 'lucide-react';
import { PlanetIcon } from '@/components/icons/PlanetIcon';
import { cn } from '@/lib/utils';
import { useHasUnreadNotifications } from '@/hooks/useHasUnreadNotifications';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { MobileSearchSheet } from '@/components/MobileSearchSheet';
import { getSidebarItem } from '@/lib/sidebarItems';

export function MobileBottomNav() {
  const location = useLocation();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const homePage = config.homePage;
  const hasUnread = useHasUnreadNotifications();

  const [searchOpen, setSearchOpen] = useState(false);

  const homeItem = useMemo(() => getSidebarItem(homePage), [homePage]);
  const HomeIcon = homeItem?.icon ?? PlanetIcon;
  const homeLabel = homeItem?.label ?? 'Feed';

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

  // Don't show notifications/search in bottom nav if they are the homepage
  const showNotifications = homePage !== 'notifications';
  const showSearch = homePage !== 'search';

  return (
    <>
      <MobileSearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} />

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-t border-border sidebar:hidden safe-area-bottom">
        <div className="h-14 flex items-center">

          <Link
            to="/"
            onClick={handleHomeClick}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
              location.pathname === '/' ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <HomeIcon className="size-5" />
            <span className="text-[10px] font-medium">{homeLabel}</span>
          </Link>

          {user && showNotifications && (
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

          {showSearch && (
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
          )}

        </div>
      </nav>
    </>
  );
}
