import { useCallback, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Search, User } from 'lucide-react';
import { PlanetIcon } from '@/components/icons/PlanetIcon';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { cn } from '@/lib/utils';
import { useHasUnreadNotifications } from '@/hooks/useHasUnreadNotifications';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useLayoutSnapshot } from '@/contexts/LayoutContext';
import { ArcBackground, ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { MobileSearchSheet } from '@/components/MobileSearchSheet';

export function MobileBottomNav() {
  const location = useLocation();
  const { user, metadata } = useCurrentUser();
  const hasUnread = useHasUnreadNotifications();
  const { scrollContainer } = useLayoutSnapshot();
  const { hidden } = useScrollDirection(scrollContainer);
  const profileUrl = useProfileUrl(user?.pubkey ?? '', metadata);

  const [searchOpen, setSearchOpen] = useState(false);

  const handleSearchClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setSearchOpen((v) => !v);
  }, []);

  // Keep the nav visible while search is open regardless of scroll
  const isHidden = hidden && !searchOpen;

  const displayName = metadata?.name || metadata?.display_name;
  const isOnProfile = user && location.pathname === profileUrl;

  return (
    <>
      <MobileSearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} />

      <nav
        className={cn(
          'fixed bottom-0 left-0 right-0 z-40 sidebar:hidden safe-area-bottom will-change-transform',
          'transition-transform duration-300 ease-in-out',
        )}
        style={isHidden ? { transform: `translateY(calc(100% + ${ARC_OVERHANG_PX}px))` } : undefined}
      >
        <ArcBackground variant="up" />

        <div className="h-11 flex items-center relative">

          {/* Feed */}
          <Link
            to="/feed"
            onClick={() => setSearchOpen(false)}
            className={cn(
              'flex items-center justify-center flex-1 py-2 transition-colors',
              (location.pathname === '/feed' || location.pathname === '/') ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <PlanetIcon className="size-5" />
          </Link>

          {/* Search */}
          <button
            onClick={handleSearchClick}
            className={cn(
              'flex items-center justify-center flex-1 py-2 transition-colors',
              searchOpen ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Search className="size-5" />
          </button>

          {/* Notifications */}
          {user && (
            <Link
              to="/notifications"
              onClick={() => setSearchOpen(false)}
              className={cn(
                'flex items-center justify-center flex-1 py-2 transition-colors',
                location.pathname === '/notifications' ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <span className="relative">
                <Bell className="size-5" />
                {hasUnread && (
                  <span className="absolute -top-1 right-0 size-2 bg-primary rounded-full" />
                )}
              </span>
            </Link>
          )}

          {/* Profile */}
          {user ? (
            <Link
              to={profileUrl}
              onClick={() => setSearchOpen(false)}
              className={cn(
                'flex items-center justify-center flex-1 py-2 transition-colors',
                isOnProfile ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Avatar shape={getAvatarShape(metadata)} className="size-5">
                <AvatarImage src={metadata?.picture} alt={displayName} />
                <AvatarFallback className="bg-primary/20 text-primary text-[8px]">
                  {displayName?.[0]?.toUpperCase() || <User className="size-3" />}
                </AvatarFallback>
              </Avatar>
            </Link>
          ) : (
            <Link
              to="/profile"
              className="flex items-center justify-center flex-1 py-2 transition-colors text-muted-foreground"
            >
              <User className="size-5" />
            </Link>
          )}

        </div>
      </nav>
    </>
  );
}
