import { useCallback, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Home, Search, User } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { cn } from '@/lib/utils';
import { useHasUnreadNotifications } from '@/hooks/useHasUnreadNotifications';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutSnapshot } from '@/contexts/LayoutContext';
import { getSidebarItem } from '@/lib/sidebarItems';
import { ArcBackground, ARC_UP_OVERHANG_PX } from '@/components/ArcBackground';
import { MobileSearchSheet } from '@/components/MobileSearchSheet';
import { MobileDorkSheet } from '@/components/AIChat/MobileDorkSheet';

/** Transform style applied when the bottom nav is hidden (scrolled away). */
const hiddenStyle: React.CSSProperties = {
  transform: `translateY(calc(100% + ${ARC_UP_OVERHANG_PX}px))`,
};

export function MobileBottomNav() {
  const location = useLocation();
  const { user, metadata } = useCurrentUser();
  const hasUnread = useHasUnreadNotifications();
  const { scrollContainer, noArcs } = useLayoutSnapshot();
  const { hidden } = useScrollDirection(scrollContainer);
  const profileUrl = useProfileUrl(user?.pubkey ?? '', metadata);

  const { config } = useAppContext();
  const homeItem = getSidebarItem(config.homePage);
  const HomeIcon = homeItem?.icon ?? Home;
  const homeLabel = homeItem?.label ?? 'Home';
  const homePath = homeItem?.path;

  const [searchOpen, setSearchOpen] = useState(false);
  const [dorkMode, setDorkMode] = useState(false);

  const handleSearchClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setSearchOpen((v) => !v);
  }, []);

  const handleClose = useCallback(() => {
    setSearchOpen(false);
    setDorkMode(false);
  }, []);

  // Hide the nav when search sheet is open so it doesn't compete for space
  const isHidden = hidden || searchOpen;

  const displayName = metadata?.name || metadata?.display_name;
  const isOnProfile = user && location.pathname === profileUrl;

  return (
    <>
      {/* Shared backdrop for both sheets */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 sidebar:hidden animate-in fade-in-0 duration-150"
          onClick={handleClose}
        />
      )}

      {/* Both sheets stay mounted when open to preserve state; hidden prop toggles visibility */}
      {searchOpen && <MobileSearchSheet hidden={dorkMode} onClose={handleClose} dorkMode={dorkMode} onToggleDork={() => setDorkMode((v) => !v)} />}
      {searchOpen && <MobileDorkSheet hidden={!dorkMode} onClose={handleClose} onToggleDork={() => setDorkMode(false)} />}

      <nav
        className={cn(
          'fixed bottom-0 left-0 right-0 z-[49] sidebar:hidden will-change-transform',
          'transition-transform duration-300 ease-in-out',
        )}
        style={isHidden ? hiddenStyle : undefined}
      >
        {/* Arc + items wrapper */}
        <div className="relative">
          <ArcBackground variant={noArcs ? 'rect' : 'up'} />
          <div className="h-11 flex items-center relative">

          {/* Home */}
          <Link
            to="/"
            onClick={handleClose}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
              (location.pathname === '/' || location.pathname === homePath) ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <HomeIcon className="size-5" />
            <span className="text-[10px] font-medium">{homeLabel}</span>
          </Link>

          {/* Search */}
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

          {/* Notifications */}
          {user && (
            <Link
              to="/notifications"
              onClick={handleClose}
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

          {/* Profile */}
          {user ? (
            <Link
              to={profileUrl}
              onClick={handleClose}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
                isOnProfile ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Avatar shape={getAvatarShape(metadata)} className="size-5">
                <AvatarImage src={metadata?.picture} alt={displayName} />
                <AvatarFallback className="bg-primary/20 text-primary text-[8px]">
                  {displayName?.[0]?.toUpperCase() || <User className="size-3" />}
                </AvatarFallback>
              </Avatar>
              <span className="text-[10px] font-medium">Profile</span>
            </Link>
          ) : (
            <Link
              to="/profile"
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors text-muted-foreground"
            >
              <User className="size-5" />
              <span className="text-[10px] font-medium">Profile</span>
            </Link>
          )}

          </div>
        </div>
        {/* Safe area fill — matches the arc's semi-transparent background */}
        <div className="safe-area-bottom bg-background/85" />
      </nav>
    </>
  );
}
