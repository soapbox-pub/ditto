import { useCallback, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { cn } from '@/lib/utils';
import { useHasUnreadNotifications } from '@/hooks/useHasUnreadNotifications';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useLayoutSnapshot } from '@/contexts/LayoutContext';
import { ArcBackground, ARC_UP_OVERHANG_PX } from '@/components/ArcBackground';
import { MobileSearchSheet } from '@/components/MobileSearchSheet';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useAppContext } from '@/hooks/useAppContext';
import { getSidebarItem, isSidebarDivider, sidebarItemIcon, itemLabel, itemPath, isItemActive } from '@/lib/sidebarItems';

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
  const { orderedItems } = useFeedSettings();
  const { config } = useAppContext();
  const homePage = config.homePage;

  const [searchOpen, setSearchOpen] = useState(false);

  const handleSearchClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setSearchOpen((v) => !v);
  }, []);

  // Keep the nav visible while search is open regardless of scroll
  const isHidden = hidden && !searchOpen;

  const displayName = metadata?.name || metadata?.display_name;

  // Show only the first 4 sidebar items (matching sidebar order), filtering out dividers and auth-gated items when logged out
  const allItems = useMemo(() => {
    return orderedItems.filter((id) => {
      if (isSidebarDivider(id)) return false;
      if (!user && getSidebarItem(id)?.requiresAuth) return false;
      return true;
    }).slice(0, 4);
  }, [orderedItems, user]);

  return (
    <>
      <MobileSearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} />

      <nav
        className={cn(
          'fixed bottom-0 left-0 right-0 z-40 sidebar:hidden will-change-transform',
          'transition-transform duration-300 ease-in-out',
        )}
        style={isHidden ? hiddenStyle : undefined}
      >
        {/* Arc + items wrapper */}
        <div className="relative">
          <ArcBackground variant={noArcs ? 'rect' : 'up'} />
          <div className="h-11 flex items-center relative">
            {allItems.map((id) => {
              const isSearch = id === 'search';
              const isProfile = id === 'profile';
              const isNotifications = id === 'notifications';
              const active = isSearch
                ? searchOpen
                : isItemActive(id, location.pathname, location.search, profileUrl, homePage);
              const label = itemLabel(id);
              const path = isProfile ? profileUrl : itemPath(id, undefined, homePage);

              // Search opens the sheet instead of navigating
              if (isSearch) {
                return (
                  <button
                    key={id}
                    onClick={handleSearchClick}
                    className={cn(
                      'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
                      active ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {sidebarItemIcon(id, 'size-5')}
                    <span className="text-[10px] font-medium">{label}</span>
                  </button>
                );
              }

              // Profile shows the user avatar
              if (isProfile && user) {
                return (
                  <Link
                    key={id}
                    to={path}
                    onClick={() => setSearchOpen(false)}
                    className={cn(
                      'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
                      active ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    <Avatar shape={getAvatarShape(metadata)} className="size-5">
                      <AvatarImage src={metadata?.picture} alt={displayName} />
                      <AvatarFallback className="bg-primary/20 text-primary text-[8px]">
                        {displayName?.[0]?.toUpperCase() || <User className="size-3" />}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-[10px] font-medium">{label}</span>
                  </Link>
                );
              }

              return (
                <Link
                  key={id}
                  to={path}
                  onClick={() => setSearchOpen(false)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <span className="relative">
                    {sidebarItemIcon(id, 'size-5')}
                    {isNotifications && hasUnread && (
                      <span className="absolute -top-1 right-0 size-2 bg-primary rounded-full" />
                    )}
                  </span>
                  <span className="text-[10px] font-medium">{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
        {/* Safe area spacer — fully opaque so any subpixel gap is invisible */}
        <div className="safe-area-bottom bg-background" />
      </nav>
    </>
  );
}
