import { profileName } from '@/lib/getDisplayName';
import { useCallback, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { FormattedMessage, useIntl } from 'react-intl';
import { Bell, Home, Search, User } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { cn } from '@/lib/utils';
import { selectionChanged } from '@/lib/haptics';
import { useHasUnreadNotifications } from '@/hooks/useHasUnreadNotifications';
import { useCurrentUserProfile } from '@/hooks/useCurrentUser';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutSnapshot } from '@/contexts/LayoutContext';
import { formatItemLabel, getSidebarItem } from '@/lib/sidebarItems';
import { ArcBackground, ARC_UP_OVERHANG_PX } from '@/components/ArcBackground';
import { MobileSearchSheet } from '@/components/MobileSearchSheet';
import { UnreadDot } from '@/components/UnreadDot';

/** Slides with the scroll (see useScrollDirection), all the way out at `--chrome-hide: 1`. */
const followStyle: React.CSSProperties = {
  transform: `translateY(calc(var(--chrome-hide, 0) * (100% + ${ARC_UP_OVERHANG_PX}px)))`,
};

/** All the way out, while the search sheet has the bottom of the screen. */
const hiddenStyle: React.CSSProperties = {
  transform: `translateY(calc(100% + ${ARC_UP_OVERHANG_PX}px))`,
};

/** Sidebar items that always have their own tab in the bottom bar. */
const FIXED_TABS = ['search', 'notifications', 'profile'];

export function MobileBottomNav() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user, metadata, imeta } = useCurrentUserProfile();
  const hasUnread = useHasUnreadNotifications();
  const { noArcs } = useLayoutSnapshot();
  const profileUrl = useProfileUrl(user?.pubkey ?? '', metadata);

  const { config } = useAppContext();
  const intl = useIntl();
  // When the homepage is already one of the fixed tabs, the first slot falls back to the feed
  const homeIsTab = FIXED_TABS.includes(config.homePage);
  const homeItem = getSidebarItem(homeIsTab ? 'feed' : config.homePage);
  const HomeIcon = homeItem?.icon ?? Home;
  const homeLabel = formatItemLabel(intl, homeItem?.id ?? 'feed');
  const homePath = homeItem?.path;
  const homeTo = homeIsTab ? (homePath ?? '/feed') : '/';
  const isOnHome = homeIsTab
    ? location.pathname === homePath
    : location.pathname === '/' || location.pathname === homePath;
  const isOnRootAs = (id: string) => location.pathname === '/' && config.homePage === id;
  const isOnNotifications = location.pathname === '/notifications' || isOnRootAs('notifications');

  const [searchOpen, setSearchOpen] = useState(false);

  const handleSearchClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    selectionChanged();
    setSearchOpen((v) => !v);
  }, []);


  const displayName = profileName(metadata);
  const isOnProfile = user && (location.pathname === profileUrl || isOnRootAs('profile'));

  return (
    <>
      <MobileSearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} />

      <nav
        className={cn(
          'push-transition-bottom-nav fixed bottom-0 left-0 right-0 z-40 sidebar:hidden will-change-transform chrome-follow',
        )}
        // Hide the nav when search sheet is open so it doesn't compete for space
        style={searchOpen ? hiddenStyle : followStyle}
      >
        {/* Arc + items wrapper */}
        <div className="relative">
          <ArcBackground variant={noArcs ? 'rect' : 'up'} />
          <div className="h-11 flex items-center relative">

          {/* Home */}
          <Link
            to={homeTo}
            onClick={() => {
              selectionChanged();
              setSearchOpen(false);
              // When already on the home page, scroll to top and refresh the feed
              if (isOnHome) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                void queryClient.invalidateQueries({ queryKey: ['feed'] });
                void queryClient.invalidateQueries({ queryKey: ['ditto-curated-feed'] });
              }
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
              isOnHome ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <span className={cn('flex', isOnHome && 'motion-safe:animate-nav-pop')}>
              <HomeIcon className="size-5" />
            </span>
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
            <span className={cn('flex', searchOpen && 'motion-safe:animate-nav-pop')}>
              <Search className="size-5" />
            </span>
            <span className="text-[10px] font-medium"><FormattedMessage id="nav.search" defaultMessage={"Search"} /></span>
          </button>

          {/* Notifications */}
          {user && (
            <Link
              to="/notifications"
              onClick={() => {
                selectionChanged();
                setSearchOpen(false);
                if (isOnNotifications) window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
                isOnNotifications ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <span className={cn('relative flex', isOnNotifications && 'motion-safe:animate-nav-pop')}>
                <Bell className="size-5" />
                <UnreadDot show={hasUnread} className="-top-1 right-0 size-2" />
              </span>
              <span className="text-[10px] font-medium"><FormattedMessage id="nav.notifications" defaultMessage={"Notifications"} /></span>
            </Link>
          )}

          {/* Profile */}
          {user ? (
            <Link
              to={profileUrl}
              onClick={() => {
                selectionChanged();
                setSearchOpen(false);
                if (isOnProfile) window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
                isOnProfile ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Avatar
                shape={getAvatarShape(metadata)}
                className={cn(
                  'size-5 ring-offset-1 ring-offset-background transition-shadow',
                  isOnProfile && 'ring-2 ring-primary motion-safe:animate-nav-pop',
                )}
              >
                <AvatarImage src={metadata?.picture} imeta={imeta?.picture} alt={displayName} />
                <AvatarFallback className="bg-primary/20 text-primary text-[8px]">
                  {displayName?.[0]?.toUpperCase() || <User className="size-3" />}
                </AvatarFallback>
              </Avatar>
              <span className="text-[10px] font-medium"><FormattedMessage id="nav.profile" defaultMessage={"Profile"} /></span>
            </Link>
          ) : (
            <Link
              to="/profile"
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors text-muted-foreground"
            >
              <User className="size-5" />
              <span className="text-[10px] font-medium"><FormattedMessage id="nav.profile" defaultMessage={"Profile"} /></span>
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
